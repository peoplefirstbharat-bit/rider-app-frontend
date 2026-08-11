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
        "com.olacabs.oladriver", "com.ubercab.driver", "com.rapido.rider",
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
import android.graphics.Rect;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

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
            String pkg = pkgNameSeq.toString().toLowerCase();
            String currentAppId = "";
            
            // 🛡️ SECURITY LOCK: सिर्फ राइडिंग ऐप्स में चलेगा
            if (pkg.contains("oladriver")) currentAppId = "ola";
            else if (pkg.contains("ubercab.driver")) currentAppId = "uber";
            else if (pkg.contains("rapido.rider")) currentAppId = "rapido";
            else if (pkg.contains("nammayatripartner")) currentAppId = "namma";
            else if (pkg.contains("indriver")) currentAppId = "indrive";
            else if (pkg.contains("blusmart.driver")) currentAppId = "blusmart";
            
            if (currentAppId.isEmpty()) return; 

            Boolean isAllowed = FilterBridgeModule.allowedApps.get(currentAppId);
            if (isAllowed == null || !isAllowed) return; 
        } else {
            return; 
        }

        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode != null) {
            if (System.currentTimeMillis() - lastActionTime < 2000) return; 
            
            detectedFare = 0;
            isCriteriaMet = false;
            isLocationMatched = FilterBridgeModule.savedLocation.isEmpty();
            
            // 🚀 STEP 1: पूरी स्क्रीन स्कैन करके पैसे और लोकेशन पकड़ो
            analyzeScreen(rootNode);
            
            // 🚀 STEP 2: अगर राइड काम की है, तो 'रीड एंड रियेक्ट' वाला दिमाग लगाओ
            if (isCriteriaMet && isLocationMatched) {
                boolean actionDone = findAndExecuteAction(rootNode);
                
                if (actionDone) {
                    lastActionTime = System.currentTimeMillis();
                    FilterBridgeModule.isServiceRunning = false; // 🔒 Auto-Sleep Mode ON
                    reportSuccessToApp();
                }
            }
        }
    }

    private void analyzeScreen(AccessibilityNodeInfo node) {
        if (node == null) return;
        
        extractFareAndLocation(node.getText());
        extractFareAndLocation(node.getContentDescription()); 
        
        for (int i = 0; i < node.getChildCount(); i++) {
            analyzeScreen(node.getChild(i));
        }
    }

    private void extractFareAndLocation(CharSequence textSeq) {
        if (textSeq == null) return;
        String text = textSeq.toString().toLowerCase();

        if (!FilterBridgeModule.savedLocation.isEmpty() && text.contains(FilterBridgeModule.savedLocation)) {
            isLocationMatched = true;
        }

        if (text.contains("₹") || text.contains("rs") || text.contains("inr")) {
            try {
                Pattern p1 = Pattern.compile("(?:₹|rs\\\\.?|inr)\\s*([0-9]+(?:\\\\.[0-9]+)?)");
                Matcher m1 = p1.matcher(text);
                
                Pattern p2 = Pattern.compile("([0-9]+(?:\\\\.[0-9]+)?)\\s*(?:₹|rs\\\\.?|inr)");
                Matcher m2 = p2.matcher(text);

                String fareString = "";
                if (m1.find()) fareString = m1.group(1);
                else if (m2.find()) fareString = m2.group(1);

                if (!fareString.isEmpty()) {
                    float floatFare = Float.parseFloat(fareString);
                    int fare = Math.round(floatFare);
                    if (fare >= FilterBridgeModule.savedMinFare && fare <= FilterBridgeModule.savedMaxFare) {
                        detectedFare = fare;
                        isCriteriaMet = true;
                    }
                }
            } catch (Exception e) {}
        }
    }

    // 🧠 THE SMART BRAIN: स्क्रीन को पढ़कर सही फैसला लेगा
    private boolean findAndExecuteAction(AccessibilityNodeInfo node) {
        if (node == null) return false;

        CharSequence textSeq = node.getText();
        CharSequence descSeq = node.getContentDescription();
        String t = textSeq != null ? textSeq.toString().toLowerCase() : "";
        String d = descSeq != null ? descSeq.toString().toLowerCase() : "";
        String combined = t + " " + d;

        // 🟢 लॉजिक 1: क्या बटन पर "स्वाइप/स्लाइड" लिखा है? -> तो सिर्फ स्वाइप मारो
        if (combined.contains("slide") || combined.contains("swipe") || combined.contains("स्लाइड")) {
            performCalculatedSwipe();
            return true;
        }

        // 🟢 लॉजिक 2: क्या बटन पर "Accept/Pick" लिखा है? -> तो उस असली बटन को ढूँढकर सिर्फ क्लिक करो
        if (combined.contains("accept") || combined.contains("स्वीकार") || combined.contains("pick") || combined.contains("go") || combined.contains("ok")) {
            AccessibilityNodeInfo clickableNode = getClickableParent(node);
            if (clickableNode != null) {
                clickableNode.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                return true;
            }
        }

        // स्क्रीन के अंदर के सारे बटन्स चेक करो
        for (int i = 0; i < node.getChildCount(); i++) {
            if (findAndExecuteAction(node.getChild(i))) return true;
        }

        // 🟢 लॉजिक 3: स्मार्ट फॉलबैक (अगर बटन पर कुछ नहीं लिखा, जैसे Uber में होता है)
        // यह चेक करेगा कि क्या स्क्रीन के बिल्कुल नीचे कोई बहुत बड़ा 'क्लिकेबल' बॉक्स है? अगर है, तो उसे क्लिक कर देगा।
        if (node.isClickable()) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            
            // अगर यह डिब्बा स्क्रीन के निचले 30% हिस्से में है और बहुत चौड़ा है (Full-width button)
            if (bounds.bottom > metrics.heightPixels * 0.7 && bounds.width() > metrics.widthPixels * 0.3) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                return true;
            }
        }

        return false;
    }

    // यह फंक्शन टेक्स्ट से लेकर उसके असली "क्लिकेबल" डिब्बे तक पहुँचने का काम करता है
    private AccessibilityNodeInfo getClickableParent(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node;
        while (current != null) {
            if (current.isClickable()) {
                return current;
            }
            current = current.getParent();
        }
        return null;
    }

    // परफेक्ट और नाप-तौल कर किया गया स्वाइप
    private void performCalculatedSwipe() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        float startX = metrics.widthPixels * 0.15f;
        float endX = metrics.widthPixels * 0.85f;
        float y = metrics.heightPixels * 0.85f; 

        Path swipePath = new Path();
        swipePath.moveTo(startX, y);
        swipePath.lineTo(endX, y);
        GestureDescription.Builder swipeBuilder = new GestureDescription.Builder();
        swipeBuilder.addStroke(new GestureDescription.StrokeDescription(swipePath, 0, 150));
        dispatchGesture(swipeBuilder.build(), null, null);
    }

    private void reportSuccessToApp() {
        new Handler(Looper.getMainLooper()).post(() -> {
            FilterBridgeModule.emitRideAccepted(detectedFare > 0 ? detectedFare : 0);
        });
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
