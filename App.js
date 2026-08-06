import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, Alert, ActivityIndicator } from 'react-native';

// ⚠️ यहाँ अपने Render वाले बैकएंड का असली URL डालें (पीछे .onrender.com तक)
const BACKEND_URL = "https://your-backend-name.onrender.com"; 

export default function App() {
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 1. रजिस्टर करने का फंक्शन
  const handleRegister = async () => {
    if (phone.length !== 10 || pin.length < 4) {
      Alert.alert('गलती', 'कृपया सही 10 अंकों का मोबाइल नंबर और 4 अंकों का PIN डालें!');
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
        Alert.alert('बधाई हो!', 'अकाउंट बन गया। अब आप लॉगिन कर सकते हैं।');
        setIsLogin(true);
      } else {
        Alert.alert('एरर', data.message || 'रजिस्टर नहीं हो पाया!');
      }
    } catch (error) {
      Alert.alert('सर्वर एरर', 'बैकएंड सर्वर से कनेक्ट नहीं हो पा रहा है!');
    }
    setLoading(false);
  };

  // 2. लॉगिन करने का फंक्शन
  const handleLogin = async () => {
    if (phone.length !== 10 || pin.length < 4) {
      Alert.alert('गलती', 'कृपया सही 10 अंकों का मोबाइल नंबर और 4 अंकों का PIN डालें!');
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
        setIsLoggedIn(true);
      } else {
        Alert.alert('एरर', data.message || 'लॉगिन फेल!');
      }
    } catch (error) {
      Alert.alert('सर्वर एरर', 'बैकएंड सर्वर से कनेक्ट नहीं हो पा रहा है!');
    }
    setLoading(false);
  };

  // 3. लॉगिन होने के बाद की स्क्रीन (डैशबोर्ड का शुरुआती ढांचा)
  if (isLoggedIn) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />
        <Text style={styles.logoText}>स्वागत है, राइडर! 🚖</Text>
        <View style={styles.card}>
          <Text style={{color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 15}}>
            आपका लॉगिन सफल हो गया है।
          </Text>
          <Text style={{color: '#FFD700', fontSize: 14, textAlign: 'center'}}>
            मोबाइल नंबर: {phone}
          </Text>
          <TouchableOpacity 
            style={[styles.primaryButton, {marginTop: 20, backgroundColor: '#ff4444'}]} 
            onPress={() => setIsLoggedIn(false)}
          >
            <Text style={[styles.buttonText, {color: '#fff'}]}>लॉगआउट (LOGOUT)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 4. मुख्य लॉगिन / रजिस्टर फॉर्म
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      <Text style={styles.logoText}>Rider Accept Pro 🚀</Text>
      
      <View style={styles.card}>
        <Text style={styles.heading}>{isLogin ? 'लॉगिन करें' : 'नया अकाउंट बनाएं'}</Text>
        
        <TextInput 
          style={styles.input} 
          placeholder="मोबाइल नंबर (10 डिजिट)" 
          placeholderTextColor="#888" 
          keyboardType="numeric"
          maxLength={10}
          value={phone}
          onChangeText={setPhone}
        />
        
        <TextInput 
          style={styles.input} 
          placeholder="4-डिजिट PIN (पासवर्ड)" 
          placeholderTextColor="#888" 
          keyboardType="numeric"
          secureTextEntry={true}
          maxLength={4}
          value= {pin}
          onChangeText={setPin}
        />
        
        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={isLogin ? handleLogin : handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" /> 
          ) : (
            <Text style={styles.buttonText}>{isLogin ? 'लॉगिन (LOGIN)' : 'रजिस्टर (REGISTER)'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchButton}>
          <Text style={styles.switchText}>
            {isLogin ? 'अकाउंट नहीं है? यहाँ क्लिक करके बनाएं' : 'पहले से अकाउंट है? लॉगिन करें'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#121212', 
    justifyContent: 'center', 
    padding: 20 
  },
  logoText: { 
    color: '#FFD700', 
    fontSize: 28, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginBottom: 40 
  },
  card: { 
    backgroundColor: '#1E1E1E', 
    padding: 25, 
    borderRadius: 15, 
    elevation: 10 
  },
  heading: { 
    color: '#FFFFFF', 
    fontSize: 22, 
    fontWeight: 'bold', 
    marginBottom: 20, 
    textAlign: 'center' 
  },
  input: { 
    backgroundColor: '#2A2A2A', 
    color: '#FFFFFF', 
    borderRadius: 8, 
    paddingHorizontal: 15, 
    paddingVertical: 12, 
    fontSize: 16, 
    marginBottom: 15, 
    borderWidth: 1, 
    borderColor: '#333' 
  },
  primaryButton: { 
    backgroundColor: '#FFD700', 
    padding: 15, 
    borderRadius: 8, 
    marginTop: 10 
  },
  buttonText: { 
    color: '#000000', 
    textAlign: 'center', 
    fontWeight: 'bold', 
    fontSize: 18 
  },
  switchButton: { 
    marginTop: 20 
  },
  switchText: { 
    color: '#4DA6FF', 
    textAlign: 'center', 
    fontSize: 14, 
    fontWeight: '600' 
  }
});
