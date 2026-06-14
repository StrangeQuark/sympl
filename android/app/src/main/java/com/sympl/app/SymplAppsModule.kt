package com.sympl.app

import android.content.ComponentName
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SymplAppsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SymplApps"

  @ReactMethod
  fun getLaunchableApps(promise: Promise) {
    try {
      val packageManager = reactContext.packageManager
      val launcherIntent =
          Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
          }

      val resolveInfos =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.queryIntentActivities(
                launcherIntent,
                PackageManager.ResolveInfoFlags.of(0),
            )
          } else {
            @Suppress("DEPRECATION")
            packageManager.queryIntentActivities(launcherIntent, 0)
          }

      val apps = Arguments.createArray()
      val seenComponents = mutableSetOf<String>()

      resolveInfos
          .asSequence()
          .filter { it.activityInfo?.packageName != reactContext.packageName }
          .sortedBy { it.loadLabel(packageManager).toString().lowercase() }
          .forEach { resolveInfo ->
            val activityInfo = resolveInfo.activityInfo ?: return@forEach
            val packageName = activityInfo.packageName
            val activityName = normalizeActivityName(packageName, activityInfo.name)
            val componentKey = "$packageName/$activityName"

            if (!seenComponents.add(componentKey)) {
              return@forEach
            }

            val app = Arguments.createMap()
            app.putString("label", resolveInfo.loadLabel(packageManager).toString())
            app.putString("packageName", packageName)
            app.putString("activityName", activityName)
            app.putBoolean("isSystemApp", isSystemApp(activityInfo.applicationInfo))
            apps.pushMap(app)
          }

      promise.resolve(apps)
    } catch (exception: Exception) {
      promise.reject("sympl_apps_unavailable", "Unable to load installed apps.", exception)
    }
  }

  @ReactMethod
  fun launchApp(packageName: String, activityName: String?, promise: Promise) {
    try {
      val launchIntent =
          if (!activityName.isNullOrBlank()) {
            Intent(Intent.ACTION_MAIN).apply {
              addCategory(Intent.CATEGORY_LAUNCHER)
              component = ComponentName(packageName, normalizeActivityName(packageName, activityName))
            }
          } else {
            reactContext.packageManager.getLaunchIntentForPackage(packageName)
          }

      if (launchIntent == null) {
        promise.reject("sympl_launch_missing", "No launch intent found for $packageName.")
        return
      }

      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      reactContext.startActivity(launchIntent)
      promise.resolve(true)
    } catch (exception: Exception) {
      promise.reject("sympl_launch_failed", "Unable to open $packageName.", exception)
    }
  }

  @ReactMethod
  fun getLauncherStatus(promise: Promise) {
    try {
      val packageManager = reactContext.packageManager
      val homeIntent =
          Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
          }
      @Suppress("DEPRECATION")
      val resolveInfo = packageManager.resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY)
      val activityInfo = resolveInfo?.activityInfo
      val currentHomePackage = activityInfo?.packageName

      val result = Arguments.createMap()
      result.putBoolean("isDefaultLauncher", currentHomePackage == reactContext.packageName)
      result.putString("currentHomePackage", currentHomePackage)
      result.putString("currentHomeLabel", resolveInfo?.loadLabel(packageManager)?.toString())
      promise.resolve(result)
    } catch (exception: Exception) {
      promise.reject("sympl_launcher_status_failed", "Unable to read launcher status.", exception)
    }
  }

  @ReactMethod
  fun openHomeSettings(promise: Promise) {
    try {
      val intent =
          Intent(Settings.ACTION_HOME_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (exception: Exception) {
      promise.reject("sympl_home_settings_failed", "Unable to open default home settings.", exception)
    }
  }

  private fun normalizeActivityName(packageName: String, activityName: String): String =
      if (activityName.startsWith(".")) "$packageName$activityName" else activityName

  private fun isSystemApp(applicationInfo: ApplicationInfo?): Boolean {
    if (applicationInfo == null) {
      return false
    }
    return (applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
  }
}
