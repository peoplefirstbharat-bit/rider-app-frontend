const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAndroidAutomator(config) {
  // 1. AndroidManifest.xml में सर्विस जोड़ना
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.service) app.service = [];
    
    app.service.push({
      '$': {
        'android:name': '.AutoClickService',
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android:exported': 'true'
      },
      'intent-filter': [{
        'action': [{ '$': { 'android:name': 'android.accessibilityservice.AccessibilityService' } }]
      }],
      'meta-data': [{
        '$': {
          'android:name': 'android.accessibilityservice',
          'android:resource': '@xml/accessibility_service_config'
        }
      }]
    });

    return config;
  });

  // 2. बैकग्राउंड में सारे नेटिव जावा और XML इंजन जनरेट करना
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resXmlPath = path.join(projectRoot, 'android/app/src/main/res/xml');
      const javaPath = path.join(projectRoot, 'android/app/src/main/java/com/rider/acceptpro');
      
      fs.mkdirSync(resXmlPath, { recursive: true });
      fs.mkdirSync(javaPath, { recursive: true });
      
      // --- XML Config (Superfast Feedback) ---
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowContentChanged|typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagRetrieveInteractiveWindows|flagReportViewIds"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true" 
    android:notificationTimeout="0" />`; // Timeout 0 for Instant Reaction
      
      // --- Bridge Module ---
      const bridgeModuleContent = `package com.rider.acceptpro;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class FilterBridgeModule extends ReactContextBaseJavaModule {
    public static int savedMinFare = 0;
    public static String savedLocation = "";
    public static boolean isServiceRunning = false;

    public FilterBridgeModule(ReactApplicationContext context) {
        super(context);
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
    public void updateAppStatus(String appId, boolean status) {}
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

      // --- Main AutoClickService (The Superfast Robot Engine) ---
      const serviceContent = `package com.rider.acceptpro;
import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.util.Log;

public class AutoClickService extends AccessibilityService {
    private long lastActionTime = 0;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!FilterBridgeModule.isServiceRunning) return;

        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode != null) {
            scanAndAcceptFast(rootNode);
        }
    }

    private void scanAndAcceptFast(AccessibilityNodeInfo node) {
        if (node == null) return;

        CharSequence textSeq = node.getText();
        if (textSeq != null) {
            String text = textSeq.toString().toLowerCase();
            
            // 1. Instant Location Match -> Click/Swipe immediately
            if (!FilterBridgeModule.savedLocation.isEmpty() && text.contains(FilterBridgeModule.savedLocation)) {
                if (executeFastAction(node, text)) return;
            }

            // 2. Instant Fare Match -> Click/Swipe immediately
            if (text.contains("₹") || text.contains("rs")) {
                try {
                    String cleanText = text.replaceAll("[^0-9]", "");
                    if (!cleanText.isEmpty()) {
                        int fare = Integer.parseInt(cleanText);
                        if (fare >= FilterBridgeModule.savedMinFare) {
                            if (executeFastAction(node, text)) return;
                        }
                    }
                } catch (Exception e) {}
            }
        }

        // Fast DOM Tree Traversal
        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            scanAndAcceptFast(node.getChild(i));
        }
    }

    private boolean executeFastAction(AccessibilityNodeInfo node, String detectedText) {
        // 🔥 HYPER-FAST COOLDOWN: 50 मिलीसेकंड (ताकि लूप में फँसकर फोन क्रैश न हो, लेकिन स्पीड 100% रहे)
        if (System.currentTimeMillis() - lastActionTime < 50) return false;

        AccessibilityNodeInfo current = node;
        while (current != null) {
            CharSequence nodeText = current.getText();
            if (nodeText != null) {
                String t = nodeText.toString().toLowerCase();

                // 🚀 SUPERFAST SWIPE (Uber / Rapido / inDrive)
                if (t.contains("slide") || t.contains("swipe") || t.contains("स्लाइड")) {
                    performInstantSwipe();
                    lastActionTime = System.currentTimeMillis();
                    return true;
                }

                // 🚀 SUPERFAST CLICK (Ola / Namma Yatri)
                if ((t.contains("accept") || t.contains("स्वीकार") || t.contains("pick")) && current.isClickable()) {
                    current.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    Log.d("AutoClickerPro", "Ride Captured in Milliseconds!");
                    lastActionTime = System.currentTimeMillis();
                    return true;
                }
            }
            current = current.getParent();
        }
        return false;
    }

    private void performInstantSwipe() {
        Path path = new Path();
        path.moveTo(150, 1500); // Swipe Start Point
        path.lineTo(900, 1500); // Swipe End Point
        
        // Duration = 100ms (Very fast swipe, almost instant)
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

  return config;
};
