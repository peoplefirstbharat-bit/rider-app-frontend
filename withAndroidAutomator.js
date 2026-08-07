const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAndroidAutomator(config) {
  
  // 1. AndroidManifest.xml में ज़बरदस्ती परमिशन और सर्विस जोड़ना (तुम्हारा ओरिजिनल कोड)
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    
    // 🔥 FORCE INJECT: Android 11+ App Detection Permission
    if (!manifest.manifest['uses-permission']) manifest.manifest['uses-permission'] = [];
    const hasQueryPerm = manifest.manifest['uses-permission'].some(
      (p) => p.$['android:name'] === 'android.permission.QUERY_ALL_PACKAGES'
    );
    if (!hasQueryPerm) {
      manifest.manifest['uses-permission'].push({ '$': { 'android:name': 'android.permission.QUERY_ALL_PACKAGES' } });
    }

    const app = manifest.manifest.application[0];
    if (!app.service) app.service = [];
    
    app.service.push({
      '$': {
        'android:name': '.AutoClickService',
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android:exported': 'true'
      },
      'intent-filter': [{ 'action': [{ '$': { 'android:name': 'android.accessibilityservice.AccessibilityService' } }] }],
      'meta-data': [{ '$': { 'android:name': 'android.accessibilityservice', 'android:resource': '@xml/accessibility_service_config' } }]
    });

    return config;
  });

  // 2. बैकग्राउंड में नेटिव जावा इंजन जनरेट करना (तुम्हारा ओरिजिनल कोड)
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resXmlPath = path.join(projectRoot, 'android/app/src/main/res/xml');
      const javaPath = path.join(projectRoot, 'android/app/src/main/java/com/rider/acceptpro');
      
      fs.mkdirSync(resXmlPath, { recursive: true });
      fs.mkdirSync(javaPath, { recursive: true });
      
      // --- XML Config ---
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowContentChanged|typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagRetrieveInteractiveWindows|flagReportViewIds"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true" 
    android:notificationTimeout="0" />`; 
      
      // --- Bridge Module (🔥 UPDATED WITH LIVE EVENT EMITTER) ---
      const bridgeModuleContent = `package com.rider.acceptpro;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

public class FilterBridgeModule extends ReactContextBaseJavaModule {
    public static int savedMinFare = 0;
    public static String savedLocation = "";
    public static boolean isServiceRunning = false;
    private static ReactApplicationContext reactContext; 

    public FilterBridgeModule(ReactApplicationContext context) {
        super(context);
        reactContext = context; // React का कांटेक्ट सेव कर लिया
    }

    @Override
    public String getName() { return "FilterBridge"; }

    @ReactMethod
    public void saveFilters(int minFare, String location) {
        savedMinFare = minFare;
        savedLocation = location != null ? location.toLowerCase().trim() : "";
    }

    @ReactMethod
    public void setServiceStatus(boolean status) {
        isServiceRunning = status;
    }

    @ReactMethod
    public void checkAppInstalled(String packageName, Promise promise) {
        try {
            PackageManager pm = getReactApplicationContext().getPackageManager();
            pm.getPackageInfo(packageName, 0);
            promise.resolve(true); 
        } catch (PackageManager.NameNotFoundException e) {
            promise.resolve(false); 
        }
    }

    @ReactMethod
    public void requestBatteryOptimization() {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getReactApplicationContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
        } catch (Exception e) {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
        }
    }

    // 🚀 NEW: यह फंक्शन सर्विस को फ्रंटएंड (History) तक मैसेज भेजने की ताकत देगा
    public static void emitRideAccepted(int fare) {
        if (reactContext != null) {
            WritableMap params = Arguments.createMap();
            params.putInt("fare", fare);
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("RideAccepted", params);
        }
    }
}`;

      // --- Bridge Package ---
      const bridgePackageContent = `package com.rider.acceptpro;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class FilterBridgePackage implements ReactPackage {
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new FilterBridgeModule(reactContext));
        return modules;
    }
}`;

      // --- Main AutoClickService (🔥 UPDATED TO SEND SIGNALS TO HISTORY TAB) ---
      const serviceContent = `package com.rider.acceptpro;
import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.util.Log;
import android.os.Handler;
import android.os.Looper;

public class AutoClickService extends AccessibilityService {
    private long lastActionTime = 0;
    private int detectedFare = 0;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!FilterBridgeModule.isServiceRunning) return;

        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode != null) {
            detectedFare = 0;
            scanAndAcceptFast(rootNode);
        }
    }

    private void scanAndAcceptFast(AccessibilityNodeInfo node) {
        if (node == null) return;

        CharSequence textSeq = node.getText();
        if (textSeq != null) {
            String text = textSeq.toString().toLowerCase();
            
            if (!FilterBridgeModule.savedLocation.isEmpty() && text.contains(FilterBridgeModule.savedLocation)) {
                if (executeFastAction(node)) return;
            }

            if (text.contains("₹") || text.contains("rs")) {
                try {
                    String cleanText = text.replaceAll("[^0-9]", "");
                    if (!cleanText.isEmpty()) {
                        int fare = Integer.parseInt(cleanText);
                        detectedFare = fare; // किराया सेव कर लिया
                        if (fare >= FilterBridgeModule.savedMinFare) {
                            if (executeFastAction(node)) return;
                        }
                    }
                } catch (Exception e) {}
            }
        }

        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            scanAndAcceptFast(node.getChild(i));
        }
    }

    private boolean executeFastAction(AccessibilityNodeInfo node) {
        if (System.currentTimeMillis() - lastActionTime < 50) return false;

        AccessibilityNodeInfo current = node;
        while (current != null) {
            CharSequence nodeText = current.getText();
            if (nodeText != null) {
                String t = nodeText.toString().toLowerCase();

                if (t.contains("slide") || t.contains("swipe") || t.contains("स्लाइड")) {
                    performInstantSwipe();
                    lastActionTime = System.currentTimeMillis();
                    reportSuccessToApp();
                    return true;
                }

                if ((t.contains("accept") || t.contains("स्वीकार") || t.contains("pick")) && current.isClickable()) {
                    current.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    lastActionTime = System.currentTimeMillis();
                    reportSuccessToApp();
                    return true;
                }
            }
            current = current.getParent();
        }
        return false;
    }

    // 🚀 NEW: फ्रंटएंड को सिग्नल भेजने वाला ट्रिगर
    private void reportSuccessToApp() {
        new Handler(Looper.getMainLooper()).post(() -> {
            FilterBridgeModule.emitRideAccepted(detectedFare > 0 ? detectedFare : 0);
        });
    }

    private void performInstantSwipe() {
        Path path = new Path();
        path.moveTo(150, 1500); 
        path.lineTo(900, 1500); 
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(new GestureDescription.StrokeDescription(path, 0, 100));
        dispatchGesture(builder.build(), null, null);
    }

    @Override
    public void onInterrupt() {}
}`;

      // फाइलों को सेव करना
      fs.writeFileSync(path.join(resXmlPath, 'accessibility_service_config.xml'), xmlContent);
      fs.writeFileSync(path.join(javaPath, 'FilterBridgeModule.java'), bridgeModuleContent);
      fs.writeFileSync(path.join(javaPath, 'FilterBridgePackage.java'), bridgePackageContent);
      fs.writeFileSync(path.join(javaPath, 'AutoClickService.java'), serviceContent);
      
      return config;
    }
  ]);

  // 🚀 3. नया फिक्स: MainApplication में पैकेज को लिंक करना
  config = withMainApplication(config, (config) => {
    let content = config.modResults.contents;
    
    // Kotlin (Expo SDK 50+) को सपोर्ट करने के लिए
    if (config.modResults.language === 'kt') {
      if (!content.includes('com.rider.acceptpro.FilterBridgePackage')) {
        content = content.replace(
          /^package .*/m,
          `$&\nimport com.rider.acceptpro.FilterBridgePackage`
        );
      }
      if (!content.includes('add(FilterBridgePackage())')) {
        content = content.replace(
          /add\(MyReactNativePackage\(\)\)/,
          `add(MyReactNativePackage())\n        add(FilterBridgePackage())`
        );
      }
    }
    // Java (पुराने वर्ज़न) को सपोर्ट करने के लिए
    else if (config.modResults.language === 'java') {
      if (!content.includes('com.rider.acceptpro.FilterBridgePackage')) {
        content = content.replace(
          /^package .*/m,
          `$&\nimport com.rider.acceptpro.FilterBridgePackage;`
        );
      }
      if (!content.includes('new FilterBridgePackage()')) {
        content = content.replace(
          /packages\.add\(new MyReactNativePackage\(\)\);/,
          `packages.add(new MyReactNativePackage());\n          packages.add(new FilterBridgePackage());`
        );
      }
    }

    config.modResults.contents = content;
    return config;
  });

  return config;
};
