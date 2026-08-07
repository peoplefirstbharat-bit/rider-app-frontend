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
      
      // --- XML Config ---
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowContentChanged|typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagRetrieveInteractiveWindows|flagReportViewIds"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true" />`;
      
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
    public String getName() {
        return "FilterBridge";
    }

    @ReactMethod
    public void saveFilters(int minFare, String location) {
        savedMinFare = minFare;
        savedLocation = location != null ? location.toLowerCase() : "";
    }

    @ReactMethod
    public void setServiceStatus(boolean status) {
        isServiceRunning = status;
    }

    @ReactMethod
    public void updateAppStatus(String appId, boolean status) {
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

      // --- Main AutoClickService ---
      const serviceContent = `package com.rider.acceptpro;
import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.util.Log;

public class AutoClickService extends AccessibilityService {
    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!FilterBridgeModule.isServiceRunning) return;

        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode != null) {
            scanAndAccept(rootNode);
        }
    }

    private void scanAndAccept(AccessibilityNodeInfo node) {
        if (node == null) return;

        if (node.getText() != null) {
            String text = node.getText().toString().toLowerCase();
            
            if (!FilterBridgeModule.savedLocation.isEmpty() && text.contains(FilterBridgeModule.savedLocation)) {
                if (clickAcceptButton(node)) return;
            }

            if (text.contains("₹") || text.contains("rs")) {
                try {
                    String cleanText = text.replaceAll("[^0-9]", "");
                    if (!cleanText.isEmpty()) {
                        int fare = Integer.parseInt(cleanText);
                        if (fare >= FilterBridgeModule.savedMinFare) {
                            if (clickAcceptButton(node)) return;
                        }
                    }
                } catch (Exception e) {}
            }
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            scanAndAccept(node.getChild());
        }
    }

    private boolean clickAcceptButton(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node;
        while (current != null) {
            CharSequence nodeText = current.getText();
            if (nodeText != null) {
                String t = nodeText.toString().toLowerCase();
                if ((t.contains("accept") || t.contains("स्वीकार") || t.contains("pick") || t.contains("slide")) && current.isClickable()) {
                    current.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    Log.d("AutoClicker", "Ride Accepted Successfully!");
                    return true;
                }
            }
            current = current.getParent();
        }
        return false;
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
  ]); // <-- यहीं पर मेरी गलती थी, मैंने यहाँ '})' लिख दिया था, जबकि '])' आना था।

  return config;
};
