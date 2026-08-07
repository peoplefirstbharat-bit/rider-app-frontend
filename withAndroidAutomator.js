const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAndroidAutomator(config) {
  // 1. AndroidManifest.xml में सर्विस और परमिशन जोड़ना
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.service) app.service = [];
    
    // Accessibility Service की एंट्री
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

  // 2. हवा में Java और XML फाइलें जनरेट करना
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      
      // फोल्डर का रास्ता (Path)
      const resXmlPath = path.join(projectRoot, 'android/app/src/main/res/xml');
      const javaPath = path.join(projectRoot, 'android/app/src/main/java/com/rider/acceptpro');
      
      // फोल्डर बनाएं (अगर नहीं हैं)
      fs.mkdirSync(resXmlPath, { recursive: true });
      fs.mkdirSync(javaPath, { recursive: true });
      
      // --- फाइल 1: XML Config ---
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowContentChanged|typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagRetrieveInteractiveWindows|flagReportViewIds"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true" />`;
      
      // --- फाइल 2: असली JAVA ऑटो-क्लिकर कोड ---
      const javaContent = `package com.rider.acceptpro;
import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.util.Log;

public class AutoClickService extends AccessibilityService {
    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode != null) {
            findAndClickAccept(rootNode);
        }
    }

    private void findAndClickAccept(AccessibilityNodeInfo node) {
        if (node == null) return;
        
        if (node.getText() != null) {
            String text = node.getText().toString().toLowerCase();
            // यहाँ हम Accept बटन के कीवर्ड्स चेक कर रहे हैं
            if ((text.contains("accept") || text.contains("स्वीकार") || text.contains("pick")) && node.isClickable()) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                Log.d("AutoClicker", "Ride Accepted!");
                return;
            }
        }
        
        for (int i = 0; i < node.getChildCount(); i++) {
            findAndClickAccept(node.getChild());
        }
    }

    @Override
    public void onInterrupt() {}
}`;
      
      // फाइलों को सेव करना
      fs.writeFileSync(path.join(resXmlPath, 'accessibility_service_config.xml'), xmlContent);
      fs.writeFileSync(path.join(javaPath, 'AutoClickService.java'), javaContent);
      
      return config;
    }
  ]);

  return config;
};
