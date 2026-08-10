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
        "com.olacabs.partner", "com.ubercab.driver", "com.rapido.passenger.to",
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
import android.os.PowerManager;
import android.content.Context;
import androidx.core.app.NotificationManagerCompat;
import android.util.Log;
import java.util.HashMap;

public class FilterBridgeModule extends ReactContextBaseJavaModule {
    public static int savedMinFare = 0;
    public static int savedMaxFare = 99999;
    public static String savedLocation = "";
    public static boolean isServiceRunning = false;
    private static ReactApplicationContext reactContext; 
    public static HashMap<String, Boolean> allowedApps = new HashMap<>();

    public FilterBridgeModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @Override
    public String getName() { return "FilterBridge"; }

    @ReactMethod
    public void saveFilters(int minFare, int maxFare, String location) {
        savedMinFare = minFare;
        savedMaxFare = maxFare > 0 ? maxFare : 99999;
        savedLocation = location != null ? location.toLowerCase().trim() : "";
    }

    @ReactMethod
    public void setServiceStatus(boolean status) {
        isServiceRunning = status;
    }

    @ReactMethod
    public void updateAppStatus(String appId, boolean status) {
        allowedApps.put(appId, status);
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

    // 🚀 फिक्स: अब Notifications का भी असली परमिशन चेक होगा!
    @ReactMethod
    public void checkPermissions(Promise promise) {
        WritableMap map = Arguments.createMap();
        try {
            Context ctx = getReactApplicationContext();
            map.putBoolean("overlay", Settings.canDrawOverlays(ctx));
            
            String prefString = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            map.putBoolean("accessibility", prefString != null && prefString.contains(ctx.getPackageName()));
            
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            map.putBoolean("battery", pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
            
            boolean hasNotificationPerm = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
            map.putBoolean("notifications", hasNotificationPerm);
            
            promise.resolve(map);
        } catch(Exception e) {
            promise.reject("ERR", e.getMessage());
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
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;

public class AutoClickService extends AccessibilityService {
    private long lastActionTime = 0;
    private int detectedFare = 0;
    private boolean isCriteriaMet = false;
    private boolean isLocationMatched = false;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!FilterBridgeModule.isServiceRunning) return;
        
        CharSequence pkgNameSeq = event.getPackageName();
        if (pkgNameSeq != null) {
            String pkg = pkgNameSeq.toString();
            String currentAppId = "";
            if (pkg.contains("olacabs.partner")) currentAppId = "ola";
            else if (pkg.contains("ubercab.driver")) currentAppId = "uber";
            else if (pkg.contains("rapido.passenger")) currentAppId = "rapido";
            else if (pkg.contains("nammayatripartner")) currentAppId = "namma";
            else if (pkg.contains("inDriver")) currentAppId = "indrive";
            else if (pkg.contains("blusmart.driver")) currentAppId = "blusmart";
            
            if (!currentAppId.isEmpty()) {
                Boolean isAllowed = FilterBridgeModule.allowedApps.get(currentAppId);
                if (isAllowed == null || !isAllowed) return; 
            }
        }

        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode != null) {
            if (System.currentTimeMillis() - lastActionTime < 2000) return; 
            
            detectedFare = 0;
            isCriteriaMet = false;
            isLocationMatched = FilterBridgeModule.savedLocation.isEmpty();
            
            // 🚀 स्टेप 1: AI Brain - पूरी स्क्रीन स्कैन करो
            analyzeScreen(rootNode);
            
            // 🚀 स्टेप 2: Hunter Mode - अगर मैच हुआ तो एक्सेप्ट मारो
            if (isCriteriaMet && isLocationMatched) {
                if (huntAndAccept(rootNode)) {
                    lastActionTime = System.currentTimeMillis();
                    reportSuccessToApp();
                }
            }
        }
    }

    private void analyzeScreen(AccessibilityNodeInfo node) {
        if (node == null) return;
        CharSequence textSeq = node.getText();
        if (textSeq != null) {
            String text = textSeq.toString().toLowerCase();
            if (!FilterBridgeModule.savedLocation.isEmpty() && text.contains(FilterBridgeModule.savedLocation)) {
                isLocationMatched = true;
            }
            if (text.contains("₹") || text.contains("rs") || text.contains("inr")) {
                try {
                    // 🚀 Decimal Bug Fixed: अब यह डॉट (Decimal) को भी समझेगा!
                    String cleanText = text.replaceAll("[^0-9.]", "");
                    if (!cleanText.isEmpty()) {
                        float floatFare = Float.parseFloat(cleanText);
                        int fare = Math.round(floatFare); // 150.50 को 151 मानेगा
                        if (fare >= FilterBridgeModule.savedMinFare && fare <= FilterBridgeModule.savedMaxFare) {
                            detectedFare = fare;
                            isCriteriaMet = true;
                        }
                    }
                } catch (Exception e) {}
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            analyzeScreen(node.getChild(i));
        }
    }

    private boolean huntAndAccept(AccessibilityNodeInfo node) {
        if (node == null) return false;
        CharSequence textSeq = node.getText();
        if (textSeq != null) {
            String t = textSeq.toString().toLowerCase();
            if (t.contains("slide") || t.contains("swipe") || t.contains("स्लाइड")) {
                performInstantSwipe();
                return true;
            }
            if (t.contains("accept") || t.contains("स्वीकार") || t.contains("pick") || t.contains("go")) {
                AccessibilityNodeInfo current = node;
                while (current != null) {
                    if (current.isClickable()) {
                        current.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return true;
                    }
                    current = current.getParent(); 
                }
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            if (huntAndAccept(node.getChild(i))) return true;
        }
        return false;
    }

    private void reportSuccessToApp() {
        new Handler(Looper.getMainLooper()).post(() -> {
            FilterBridgeModule.emitRideAccepted(detectedFare > 0 ? detectedFare : 0);
        });
    }

    private void performInstantSwipe() {
        // 🚀 Swipe Bug Fixed: अब हर स्क्रीन के साइज को खुद नापकर परफेक्ट स्वाइप करेगा!
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        float startX = metrics.widthPixels * 0.2f;  // स्क्रीन के 20% हिस्से से शुरू
        float endX = metrics.widthPixels * 0.8f;    // स्क्रीन के 80% हिस्से तक जाएगा
        float y = metrics.heightPixels * 0.85f;     // स्क्रीन के नीचे वाले हिस्से (85%) पर स्वाइप करेगा

        Path path = new Path();
        path.moveTo(startX, y); 
        path.lineTo(endX, y); 
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
