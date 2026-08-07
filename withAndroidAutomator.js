const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAndroidAutomator(config) {
  
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    
    if (!manifest.manifest.queries) {
        manifest.manifest.queries = [{ package: [] }];
    } else if (!manifest.manifest.queries[0].package) {
        manifest.manifest.queries[0].package = [];
    }

    const packagesToQuery = [
        "com.olacabs.partner", "com.ubercab.driver", "com.rapido.rider",
        "in.juspay.nammayatripartner", "sinet.startup.inDriver", "com.blusmart.driver"
    ];

    packagesToQuery.forEach(pkg => {
        const exists = manifest.manifest.queries[0].package.some(p => p.$['android:name'] === pkg);
        if (!exists) {
            manifest.manifest.queries[0].package.push({ '$': { 'android:name': pkg } });
        }
    });

    const app = manifest.manifest.application[0];
    if (!app.service) app.service = [];
    
    const serviceExists = app.service.some(s => s.$['android:name'] === '.AutoClickService');
    if (!serviceExists) {
      app.service.push({
        '$': {
          'android:name': '.AutoClickService',
          'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android:exported': 'true'
        },
        'intent-filter': [{ 'action': [{ '$': { 'android:name': 'android.accessibilityservice.AccessibilityService' } }] }],
        'meta-data': [{ '$': { 'android:name': 'android.accessibilityservice', 'android:resource': '@xml/accessibility_service_config' } }]
      });
    }
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resXmlPath = path.join(projectRoot, 'android/app/src/main/res/xml');
      const javaPath = path.join(projectRoot, 'android/app/src/main/java/com/rider/acceptpro');
      
      fs.mkdirSync(resXmlPath, { recursive: true });
      fs.mkdirSync(javaPath, { recursive: true });
      
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowContentChanged|typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagRetrieveInteractiveWindows|flagReportViewIds"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true" 
    android:notificationTimeout="0" />`; 
      
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
import android.util.Log;

public class FilterBridgeModule extends ReactContextBaseJavaModule {
    public static int savedMinFare = 0;
    public static String savedLocation = "";
    public static boolean isServiceRunning = false;
    private static ReactApplicationContext reactContext; 

    public FilterBridgeModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
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

    // 🚀 FIX 3: यह मेथड मिसिंग था जिसकी वजह से ऐप क्रैश हो रहा था!
    @ReactMethod
    public void updateAppStatus(String appId, boolean status) {
        Log.d("FilterBridge", "App status updated: " + appId + " -> " + status);
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
                        detectedFare = fare; 
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

      fs.writeFileSync(path.join(resXmlPath, 'accessibility_service_config.xml'), xmlContent);
      fs.writeFileSync(path.join(javaPath, 'FilterBridgeModule.java'), bridgeModuleContent);
      fs.writeFileSync(path.join(javaPath, 'FilterBridgePackage.java'), bridgePackageContent);
      fs.writeFileSync(path.join(javaPath, 'AutoClickService.java'), serviceContent);
      
      return config;
    }
  ]);

  config = withMainApplication(config, (config) => {
    let content = config.modResults.contents;
    if (config.modResults.language === 'kt') {
      if (!content.includes('com.rider.acceptpro.FilterBridgePackage')) {
        content = content.replace(
          /return PackageList\(this\)\.packages/g,
          'val customPackagesList = PackageList(this).packages\n          customPackagesList.add(com.rider.acceptpro.FilterBridgePackage())\n          return customPackagesList'
        );
      }
    } else if (config.modResults.language === 'java') {
      if (!content.includes('com.rider.acceptpro.FilterBridgePackage')) {
        if (content.includes('List<ReactPackage> packages = new PackageList(this).getPackages();')) {
            content = content.replace(
                'List<ReactPackage> packages = new PackageList(this).getPackages();',
                'List<ReactPackage> packages = new PackageList(this).getPackages();\n          packages.add(new com.rider.acceptpro.FilterBridgePackage());'
            );
        } else {
            content = content.replace(
                /return new PackageList\(this\)\.getPackages\(\);/g,
                'List<ReactPackage> customPackagesList = new PackageList(this).getPackages();\n          customPackagesList.add(new com.rider.acceptpro.FilterBridgePackage());\n          return customPackagesList;'
            );
        }
      }
    }
    config.modResults.contents = content;
    return config;
  });

  return config;
};
