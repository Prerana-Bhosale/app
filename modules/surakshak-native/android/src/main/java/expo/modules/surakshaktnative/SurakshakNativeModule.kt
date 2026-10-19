package expo.modules.surakshaktnative

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SurakshakNativeModule : Module() {
  private var proximityWakeLock: PowerManager.WakeLock? = null
  private var sirenPlayer: MediaPlayer? = null
  private var previousAlarmVolume: Int? = null
  override fun definition() = ModuleDefinition {
    Name("SurakshakNative")

    /**
     * Turns the screen off while the phone is held to the ear, like a real
     * call — used once a fake call is answered so the lit screen doesn't give
     * it away. Requires `WAKE_LOCK` (declared in app.config.ts).
     */
    AsyncFunction("setProximityScreenOff") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction
      if (enabled) {
        if (proximityWakeLock?.isHeld == true) return@AsyncFunction
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!powerManager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
          return@AsyncFunction
        }
        proximityWakeLock =
          powerManager
            .newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "surakshak:fake-call")
            .apply { acquire(PROXIMITY_WAKE_LOCK_MAX_MS) }
      } else {
        releaseProximityWakeLock()
      }
    }

OnDestroy {
  releaseProximityWakeLock()
  stopSirenPlayback()
}
    /**
     * Send SMS directly in the background with no compose UI and no user
     * interaction. Requires the `SEND_SMS` permission (declared in
     * app.config.ts, requested at runtime from JS).
     *
     * The message is always run through `divideMessage`: a 160-character
     * check is wrong for anything containing Devanagari (UCS-2 segments
     * hold 70), and an oversized single part is dropped by the radio
     * without an error. Each part carries a sent-PendingIntent so the
     * promise reports what the radio actually did instead of resolving
     * "sent" the moment the request is queued.
     */
    AsyncFunction("sendSms") { phoneNumber: String, message: String, promise: expo.modules.kotlin.Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "No React context", null)
        return@AsyncFunction
      }

      if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
          != PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject(
          "PERMISSION_DENIED",
          "SEND_SMS permission not granted. Ensure android.permission.SEND_SMS is in app.config.ts.",
          null,
        )
        return@AsyncFunction
      }

      if (phoneNumber.isBlank()) {
        promise.reject("INVALID_PHONE", "Phone number cannot be empty", null)
        return@AsyncFunction
      }

      try {
        val smsManager = context.getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
        val parts = smsManager.divideMessage(message)
        sendWithResult(context, smsManager, phoneNumber, parts, promise)
      } catch (e: Exception) {
        promise.reject("SMS_FAILED", "Failed to send SMS: ${e.message}", e)
      }
    }

    /**
     * Switches the launcher entry between the default icon and the
     * "Calculator" disguise. Both are `activity-alias` launchers added by
     * `plugins/withDisguiseIcon.js`, named `<applicationId>.<Alias>`.
     */
    AsyncFunction("setAppIcon") { name: String?, promise: expo.modules.kotlin.Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "No React context", null)
        return@AsyncFunction
      }
      val packageName = context.packageName
      val default = ComponentName(packageName, "$packageName.$DEFAULT_LAUNCHER_ALIAS")
      val calculator = ComponentName(packageName, "$packageName.$CALCULATOR_LAUNCHER_ALIAS")
      val (enable, disable) =
        if (name == CALCULATOR_ICON_NAME) calculator to default else default to calculator
      try {
        val pm = context.packageManager
        // Enable first so there is never a moment with no launcher entry.
        pm.setComponentEnabledSetting(
          enable,
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
          PackageManager.DONT_KILL_APP,
        )
        pm.setComponentEnabledSetting(
          disable,
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP,
        )
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ICON_FAILED", "Failed to switch launcher icon: ${e.message}", e)
      }
    }

    AsyncFunction("checkSmsPermission") { promise: expo.modules.kotlin.Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val granted =
        ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) ==
          PackageManager.PERMISSION_GRANTED
      promise.resolve(granted)
    }

    /**
     * Place a call directly via `Intent.ACTION_CALL` — no dialer, no prompt.
     * Requires the `CALL_PHONE` permission (declared in app.config.ts).
     */
    AsyncFunction("placeCall") { phoneNumber: String, promise: expo.modules.kotlin.Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "No React context", null)
        return@AsyncFunction
      }

      if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
          != PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject(
          "PERMISSION_DENIED",
          "CALL_PHONE permission not granted. Ensure android.permission.CALL_PHONE is in app.config.ts.",
          null,
        )
        return@AsyncFunction
      }

      if (phoneNumber.isBlank()) {
        promise.reject("INVALID_PHONE", "Phone number cannot be empty", null)
        return@AsyncFunction
      }

      try {
        val intent =
          Intent(Intent.ACTION_CALL).apply {
            data = Uri.parse("tel:${phoneNumber.trim()}")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
          }
        context.startActivity(intent)
        promise.resolve("calling")
            } catch (e: Exception) {
        promise.reject("CALL_FAILED", "Failed to place call: ${e.message}", e)
      }
    }

    AsyncFunction("startSiren") { audioUri: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("No React context")

      // Avoid starting the siren more than once.
      if (sirenPlayer?.isPlaying == true) return@AsyncFunction

      val audioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

      // Save the original alarm volume before raising it.
      if (previousAlarmVolume == null) {
        previousAlarmVolume = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
      }

      try {
        audioManager.setStreamVolume(
          AudioManager.STREAM_ALARM,
          audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM),
          0,
        )

        val player = MediaPlayer()
        player.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        player.setDataSource(context, Uri.parse(audioUri))
        player.isLooping = true
        player.prepare()
        player.start()

        sirenPlayer = player
      } catch (e: Exception) {
        stopSirenPlayback()
        throw e
      }
    }

    AsyncFunction("stopSiren") {
      stopSirenPlayback()
    }
  }

  /**
   * Sends `parts` and settles `promise` once every part reports back (or
   * once [SEND_RESULT_TIMEOUT_MS] passes — some OEM builds never fire the
   * sent intent, and an SOS must not hang on that; the message was handed
   * to the radio, so it resolves as sent-unconfirmed).
   */
  private fun sendWithResult(
    context: Context,
    smsManager: SmsManager,
    phoneNumber: String,
    parts: ArrayList<String>,
    promise: expo.modules.kotlin.Promise,
  ) {
    val action = "${context.packageName}.SMS_SENT.${UUID.randomUUID()}"
    val remaining = AtomicInteger(parts.size)
    val settled = AtomicBoolean(false)
    val handler = Handler(Looper.getMainLooper())
    var failureCode: Int? = null

    lateinit var receiver: BroadcastReceiver
    fun settle(block: () -> Unit) {
      if (settled.compareAndSet(false, true)) {
        handler.removeCallbacksAndMessages(action)
        try {
          context.unregisterReceiver(receiver)
        } catch (_: IllegalArgumentException) {
          // Already unregistered.
        }
        block()
      }
    }

    receiver =
      object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          if (resultCode != Activity.RESULT_OK) failureCode = resultCode
          if (remaining.decrementAndGet() > 0) return
          val code = failureCode
          settle {
            if (code == null) {
              promise.resolve("sent")
            } else {
              promise.reject("SMS_FAILED", "Radio reported send failure (code $code)", null)
            }
          }
        }
      }
    ContextCompat.registerReceiver(
      context,
      receiver,
      IntentFilter(action),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )

    val sentIntents =
      ArrayList(
        parts.indices.map { index ->
          PendingIntent.getBroadcast(
            context,
            index,
            Intent(action).setPackage(context.packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
          )
        },
      )

    handler.postAtTime(
      { settle { promise.resolve("sent_unconfirmed") } },
      action,
      android.os.SystemClock.uptimeMillis() + SEND_RESULT_TIMEOUT_MS,
    )

    try {
      if (parts.size > 1) {
        smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, null)
      } else {
        smsManager.sendTextMessage(phoneNumber, null, parts.firstOrNull() ?: "", sentIntents[0], null)
      }
    } catch (e: Exception) {
      settle { promise.reject("SMS_FAILED", "Failed to send SMS: ${e.message}", e) }
    }
  }

  private fun releaseProximityWakeLock() {
    proximityWakeLock?.let { if (it.isHeld) it.release() }
    proximityWakeLock = null
  }
  private fun stopSirenPlayback() {
  try {
    sirenPlayer?.let { player ->
      if (player.isPlaying) {
        player.stop()
      }
      player.release()
    }
  } catch (_: Exception) {
    // Player may already be stopped or released.
  } finally {
    sirenPlayer = null
  }

  val previousVolume = previousAlarmVolume
  previousAlarmVolume = null

  if (previousVolume != null) {
    val context = appContext.reactContext
    if (context != null) {
      val audioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

      audioManager.setStreamVolume(
        AudioManager.STREAM_ALARM,
        previousVolume,
        0,
      )
    }
  }
}

  companion object {
    private const val DEFAULT_LAUNCHER_ALIAS = "DefaultLauncher"
    private const val CALCULATOR_LAUNCHER_ALIAS = "CalculatorLauncher"
    private const val CALCULATOR_ICON_NAME = "calculator"
    private const val SEND_RESULT_TIMEOUT_MS = 30_000L
    /** Safety net so a wake lock is never held forever if JS never releases it. */
    private const val PROXIMITY_WAKE_LOCK_MAX_MS = 60 * 60 * 1000L
  }
}
