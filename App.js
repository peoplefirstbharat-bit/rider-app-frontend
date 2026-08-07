import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, Alert, ActivityIndicator, ScrollView, Switch, Image, Linking, Platform } from 'react-native';

// ⚠️ यहाँ अपने Render वाले बैकएंड का असली URL डालें (पीछे का स्लैश / न लगाएं)
const BACKEND_URL = "https://your-backend-name.onrender.com"; 

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('login'); 
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  // यूज़र डेटा
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubActive, setIsSubActive] = useState(false);

  // सेटिंग्स और फिल्टर्स (Max Distance हटा दिया गया है)
  const [minFare, setMinFare] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  
  // सर्विस कंट्रोल
  const [serviceOn, setServiceOn] = useState(false);

  // डायनामिक पेमेंट डेटा
  const [paymentInfo, setPaymentInfo] = useState({ upiId: 'लोड हो रहा है...', upiNumber: 'लोड हो रहा है...', qrUrl: '' });
  const [utr, setUtr] = useState('');
  const [selectedPlanDays, setSelectedPlanDays] = useState(7);
  const [planAmount, setPlanAmount] = useState(39); 

  // पेमेंट पेज खुलते ही ऑटोमैटिक सर्वर से QR और UPI ले आना
  useEffect(() => {
    if (currentScreen === 'payment') {
      fetch(`${BACKEND_URL}/api/payment-info`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setPaymentInfo(data.data);
        })
        .catch(err => console.log('पेमेंट इन्फो फेच करने में एरर'));
    }
  }, [currentScreen]);

  // 1. लॉगिन फंक्शन
  const handleLogin = async () => {
    if (phone.length !== 10 || pin.length < 4) {
      Alert.alert('गलती', 'कृपया सही 10 अंकों का नंबर और 4 अंकों का PIN डालें!');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin })
      });
      const data = await response.json();
      
      if (data.success) {
        setIsSubActive(data.active);
        if (data.data) {
          setMinFare(data.data.minFare ? data.data.minFare.toString() : '');
          setPreferredLocation(data.data.preferredLocation || '');
        }
        setCurrentScreen('dashboard');
      } else {
        Alert.alert('एरर', data.message || 'लॉगिन फेल!');
      }
    } catch (error) {
      Alert.alert('सर्वर एरर', 'बैकएंड से कनेक्ट नहीं हो पा रहा है!');
    }
    setLoading(false);
  };

  // 2. रजिस्टर फंक्शन
  const handleRegister = async () => {
    if (phone.length !== 10 || pin.length < 4) {
      Alert.alert('गलती', 'कृपया सही 10 अंकों का नंबर और 4 अंकों का PIN डालें!');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin })
      });
      const data = await response.json();
      
      if (data.success) {
        Alert.alert('बधाई हो!', 'अकाउंट बन गया। अब लॉगिन करें।');
        setIsLoginMode(true);
      } else {
        Alert.alert('एरर', data.message || 'रजिस्टर नहीं हो पाया!');
      }
    } catch (error) {
      Alert.alert('सर्वर एरर', 'बैकएंड से कनेक्ट नहीं हो पा रहा है!');
    }
    setLoading(false);
  };

  // 3. सेटिंग्स सेव करने का फंक्शन
  const saveSettings = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone, 
          minFare: Number(minFare), 
          preferredLocation 
        })
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('सफलता', 'आपकी सेटिंग्स सेव हो गईं!');
      }
    } catch (error) {
      Alert.alert('एरर', 'सेटिंग्स सेव नहीं हो पाईं!');
    }
  };

  // 4. सर्विस ऑन/ऑफ टॉगल (Accessibility Permission के साथ)
  const toggleService = async (val) => {
    if (!isSubActive) {
      Alert.alert('प्रतिबंध', 'सर्विस चालू करने के लिए पहले प्लान एक्टिव करें!');
      return;
    }
    
    setServiceOn(val);

    // अगर सर्विस ऑन की जा रही है, तो एंड्रॉइड की एक्सेसिबिलिटी सेटिंग खोलें
    if (val) {
      Alert.alert(
        "परमिशन की ज़रूरत",
        "ऑटो-राइड एक्सेप्ट करने के लिए कृपया अगली स्क्रीन पर 'Rider Accept Pro' को ON करें।",
        [
          { text: "कैंसिल", onPress: () => setServiceOn(false), style: "cancel" },
          { 
            text: "सेटिंग खोलें", 
            onPress: () => {
              if (Platform.OS === 'android') {
                Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS').catch(() => {
                  Linking.openSettings(); // अगर Intent काम न करे तो डिफ़ॉल्ट सेटिंग खोलें
                });
              }
            } 
          }
        ]
      );
    }
  };

  // 5. पेमेंट रिक्वेस्ट भेजने का फंक्शन
  const sendPaymentRequest = async () => {
    if (!utr || utr.length < 6) {
      Alert.alert('गलती', 'कृपया सही 12-अंकों का UTR / Transaction ID डालें!');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/payment-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, utr, planDays: selectedPlanDays, amount: planAmount })
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('सफलता!', 'पेमेंट रिक्वेस्ट एडमिन के पास भेज दी गई है। अप्रूव होते ही प्लान चालू हो जाएगा!');
        setCurrentScreen('dashboard');
      } else {
        Alert.alert('एरर', data.message);
      }
    } catch (error) {
      Alert.alert('सर्वर एरर', 'पेमेंट रिक्वेस्ट नहीं भेजी जा सकी!');
    }
    setLoading(false);
  };

  // ================= SCREEN 1: LOGIN / REGISTER =================
  if (currentScreen === 'login') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />
        <Text style={styles.logoText}>Rider Accept Pro 🚀</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>{isLoginMode ? 'लॉगिन करें' : 'नया अकाउंट बनाएं'}</Text>
          <TextInput 
            style={styles.input} placeholder="मोबाइल नंबर (10 डिजिट)" placeholderTextColor="#888" 
            keyboardType="numeric" maxLength={10} value={phone} onChangeText={setPhone}
          />
          <TextInput 
            style={styles.input} placeholder="4-डिजिट PIN" placeholderTextColor="#888" 
            keyboardType="numeric" secureTextEntry={true} maxLength={4} value={pin} onChangeText={setPin}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={isLoginMode ? handleLogin : handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>{isLoginMode ? 'लॉगिन (LOGIN)' : 'रजिस्टर'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={styles.switchButton}>
            <Text style={styles.switchText}>{isLoginMode ? 'अकाउंट नहीं है? रजिस्टर करें' : 'पहले से अकाउंट है? लॉगिन करें'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ================= SCREEN 2: DASHBOARD =================
  if (currentScreen === 'dashboard') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />
        <Text style={styles.logoText}>डैशबोर्ड 🚖</Text>
        
        <View style={styles.card}>
          <Text style={{color: '#aaa', fontSize: 14}}>यूज़र: {phone}</Text>
          <Text style={[styles.subStatus, {color: isSubActive ? '#00FF00' : '#FF4444'}]}>
            {isSubActive ? '🟢 प्लान एक्टिव (Active)' : '🔴 प्लान इनएक्टिव (Expired)'}
          </Text>

          {!isSubActive && (
            <TouchableOpacity style={[styles.primaryButton, {backgroundColor: '#FF4444', marginBottom: 15}]} onPress={() => setCurrentScreen('payment')}>
              <Text style={styles.buttonText}>सस्ते प्लान्स खरीदें (Buy Plan)</Text>
            </TouchableOpacity>
          )}

          <View style={styles.row}>
            <Text style={{color: '#fff', fontSize: 16}}>ऑटो-एक्सेप्ट सर्विस</Text>
            <Switch value={serviceOn} onValueChange={toggleService} />
          </View>

          <TouchableOpacity style={[styles.primaryButton, {backgroundColor: '#4DA6FF', marginTop: 20}]} onPress={() => setCurrentScreen('settings')}>
            <Text style={styles.buttonText}>⚙️ लोकेशन और फिल्टर्स सेट करें</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.switchButton, {marginTop: 25}]} onPress={() => setCurrentScreen('login')}>
            <Text style={{color: '#ff4444', textAlign: 'center', fontWeight: 'bold'}}>लॉगआउट (Logout)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ================= SCREEN 3: SETTINGS =================
  if (currentScreen === 'settings') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />
        <Text style={styles.logoText}>फिल्टर्स और लोकेशन 🎯</Text>
        
        <View style={styles.card}>
          <Text style={styles.label}>न्यूनतम किराया (Min Fare ₹):</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="जैसे: 50" placeholderTextColor="#888" value={minFare} onChangeText={setMinFare} />
          <Text style={{color: '#888', fontSize: 12, marginBottom: 15}}>*कम से कम इतने रुपये की राइड आएगी तभी ऐप एक्सेप्ट करेगा।</Text>

          <Text style={styles.label}>मनपसंद लोकेशन (Preferred Drop Location):</Text>
          <TextInput style={styles.input} placeholder="जैसे: Kanpur Central" placeholderTextColor="#888" value={preferredLocation} onChangeText={setPreferredLocation} />
          <Text style={{color: '#888', fontSize: 12, marginBottom: 15}}>*अगर इस लोकेशन की राइड आती है, तो ऐप किराया देखे बिना तुरंत एक्सेप्ट कर लेगा! (Optional)</Text>

          <TouchableOpacity style={styles.primaryButton} onPress={saveSettings}>
            <Text style={styles.buttonText}>सेटिंग्स सेव करें</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.switchButton, {marginTop: 20}]} onPress={() => setCurrentScreen('dashboard')}>
            <Text style={styles.switchText}>⬅️ वापस डैशबोर्ड पर जाएं</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ================= SCREEN 4: PAYMENT & DYNAMIC QR =================
  if (currentScreen === 'payment') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />
        <Text style={styles.logoText}>किफायती सब्सक्रिप्शन प्लान 💳</Text>
        
        <View style={styles.card}>
          <Text style={{color: '#fff', fontSize: 16, marginBottom: 10, textAlign: 'center'}}>सुपर सेवर प्लान चुनें:</Text>
          
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15}}>
            <TouchableOpacity style={[styles.planBox, selectedPlanDays === 1 && styles.selectedPlan]} onPress={() => { setSelectedPlanDays(1); setPlanAmount(10); }}>
              <Text style={{color: '#fff', fontWeight: 'bold'}}>1 दिन</Text>
              <Text style={{color: '#FFD700'}}>₹10</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.planBox, selectedPlanDays === 7 && styles.selectedPlan]} onPress={() => { setSelectedPlanDays(7); setPlanAmount(39); }}>
              <Text style={{color: '#fff', fontWeight: 'bold'}}>7 दिन</Text>
              <Text style={{color: '#FFD700'}}>₹39</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.planBox, selectedPlanDays === 30 && styles.selectedPlan]} onPress={() => { setSelectedPlanDays(30); setPlanAmount(99); }}>
              <Text style={{color: '#fff', fontWeight: 'bold'}}>30 दिन</Text>
              <Text style={{color: '#FFD700'}}>₹99</Text>
            </TouchableOpacity>
          </View>

          <Text style={{color: '#FFD700', textAlign: 'center', marginBottom: 10, fontSize: 15}}>नीचे दिए गए UPI या QR पर पेमेंट करें:</Text>
          
          {/* डायनामिक पेमेंट बॉक्स जो टेलीग्राम कमांड से अपडेट होगा */}
          <View style={styles.qrPlaceholder}>
            {paymentInfo.qrUrl ? (
              <Image source={{ uri: paymentInfo.qrUrl }} style={{ width: 140, height: 140, marginBottom: 10 }} />
            ) : null}
            <Text style={{color: '#000', fontWeight: 'bold', fontSize: 15}}>UPI ID: {paymentInfo.upiId}</Text>
            <Text style={{color: '#000', fontWeight: 'bold', fontSize: 14, marginTop: 3}}>UPI नंबर: {paymentInfo.upiNumber}</Text>
            <Text style={{color: '#d32f2f', fontWeight: 'bold', fontSize: 14, marginTop: 5}}>देय राशि: ₹{planAmount}</Text>
          </View>

          <TextInput 
            style={[styles.input, {marginTop: 15}]} 
            placeholder="पेमेंट के बाद 12-अंकों का UTR नंबर डालें" 
            placeholderTextColor="#888" 
            keyboardType="numeric"
            value={utr} 
            onChangeText={setUtr} 
          />

          <TouchableOpacity style={styles.primaryButton} onPress={sendPaymentRequest} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>पेमेंट सबमिट करें</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.switchButton, {marginTop: 15}]} onPress={() => setCurrentScreen('dashboard')}>
            <Text style={styles.switchText}>⬅️ वापस जाएं</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#121212', justifyContent: 'center', padding: 20 },
  logoText: { color: '#FFD700', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, elevation: 10 },
  heading: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { color: '#ccc', fontSize: 14, marginBottom: 5 },
  input: { backgroundColor: '#2A2A2A', color: '#FFFFFF', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12, fontSize: 16, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  primaryButton: { backgroundColor: '#FFD700', padding: 15, borderRadius: 8, marginTop: 5 },
  buttonText: { color: '#000000', textAlign: 'center', fontWeight: 'bold', fontSize: 16 },
  switchButton: { marginTop: 15 },
  switchText: { color: '#4DA6FF', textAlign: 'center', fontSize: 14, fontWeight: '600' },
  subStatus: { fontSize: 16, fontWeight: 'bold', marginVertical: 15, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2A2A2A', padding: 15, borderRadius: 8, marginVertical: 10 },
  planBox: { flex: 1, backgroundColor: '#2A2A2A', padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#444' },
  selectedPlan: { borderColor: '#FFD700', backgroundColor: '#333' },
  qrPlaceholder: { backgroundColor: '#fff', padding: 15, borderRadius: 8, alignItems: 'center', marginVertical: 10 }
});
