import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, Alert, ActivityIndicator, ScrollView, Switch, Image, Linking, Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ यहाँ अपना असली बैकएंड URL डालें 
const BACKEND_URL = "https://ride-auto-backend.onrender.com";
 
// जावा इंजन से जुड़ने वाला ब्रिज
const { FilterBridge } = NativeModules;

export default function App() {
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [activeTab, setActiveTab] = useState('Dashboard'); 
  const [showPayment, setShowPayment] = useState(false);

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubActive, setIsSubActive] = useState(false);
  
  const [minFare, setMinFare] = useState('');
  const [maxFare, setMaxFare] = useState(''); 
  const [preferredLocation, setPreferredLocation] = useState('');
  const [serviceOn, setServiceOn] = useState(false);

  const [paymentInfo, setPaymentInfo] = useState({ upiId: 'लोड हो रहा है...', upiNumber: '...', qrUrl: '' });
  const [plansList, setPlansList] = useState([]); // प्लान्स लिस्ट के लिए स्टेट
  const [utr, setUtr] = useState('');
  const [selectedPlanDays, setSelectedPlanDays] = useState(7);
  const [planAmount, setPlanAmount] = useState(199);

  const [perms, setPerms] = useState({ accessibility: false, overlay: false, battery: false, notifications: false });

  const [appsStatus, setAppsStatus] = useState([
    { id: 'ola', name: 'Ola', desc: 'Cab / Auto', status: true },
    { id: 'uber', name: 'Uber', desc: 'Cab / Moto', status: true },
    { id: 'rapido', name: 'Rapido', desc: 'Bike taxi', status: false },
    { id: 'indrive', name: 'inDrive', desc: 'Ride sharing', status: false },
    { id: 'namma', name: 'Namma Yatri', desc: 'Auto / Taxi', status: false },
  ]);

  useEffect(() => {
    checkLoginStatus();
    fetchPlans();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const savedPhone = await AsyncStorage.getItem('user_phone');
      const savedSub = await AsyncStorage.getItem('is_sub_active');
      const savedMinFare = await AsyncStorage.getItem('min_fare');
      const savedLoc = await AsyncStorage.getItem('pref_loc');

      if (savedPhone) {
        setPhone(savedPhone);
        setIsSubActive(savedSub === 'true');
        if (savedMinFare) setMinFare(savedMinFare);
        if (savedLoc) setPreferredLocation(savedLoc);
        setIsLoggedIn(true);
      }
    } catch (e) { console.log('Error reading storage'); }
    setIsAppLoading(false);
  };

  // बैकएंड से प्लान्स मँगाने का फंक्शन
  const fetchPlans = () => {
    fetch(`${BACKEND_URL}/api/plans`)
      .then(res => res.json())
      .then(data => { 
        if (data.success) {
          setPlansList(data.data); 
        }
      })
      .catch(err => console.log('Plans Fetch Error'));
  };

  useEffect(() => {
    if (showPayment) {
      fetch(`${BACKEND_URL}/api/payment-info`)
        .then(res => res.json())
        .then(data => { if (data.success) setPaymentInfo(data.data); })
        .catch(err => console.log('Payment Info Error'));
    }
  }, [showPayment]);

  const handleAuth = async () => {
    if (phone.length !== 10 || pin.length < 4) return Alert.alert('गलती', 'सही 10 अंकों का नंबर और 4 अंकों का PIN डालें!');
    
    setLoading(true);
    const endpoint = isLoginMode ? '/api/login' : '/api/register';
    
    try {
      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ phone, pin })
      });
      const data = await response.json();
      
      if (data.success) {
        if (!isLoginMode) { 
          Alert.alert('सफल', 'अकाउंट बन गया! अब लॉगिन करें।'); 
          setIsLoginMode(true); 
        } else {
          setIsSubActive(data.active || true);
          
          let mFare = data.data?.minFare ? data.data.minFare.toString() : '';
          let pLoc = data.data?.preferredLocation || '';
          
          setMinFare(mFare);
          setPreferredLocation(pLoc);
          
          await AsyncStorage.setItem('user_phone', phone);
          await AsyncStorage.setItem('is_sub_active', String(data.active || true));
          await AsyncStorage.setItem('min_fare', mFare);
          await AsyncStorage.setItem('pref_loc', pLoc);

          setIsLoggedIn(true);
        }
      } else {
        Alert.alert('एरर', data.message || 'अकाउंट नहीं मिला!');
      }
    } catch (error) { 
      Alert.alert('एरर', 'सर्वर कनेक्ट नहीं हो रहा!'); 
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    setIsLoggedIn(false);
    setPhone('');
    setPin('');
    if (FilterBridge) FilterBridge.setServiceStatus(false);
  };

  const saveFilters = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, minFare: Number(minFare), preferredLocation })
      });
      const data = await response.json();
      
      if (data.success) {
        await AsyncStorage.setItem('min_fare', minFare);
        await AsyncStorage.setItem('pref_loc', preferredLocation);

        if (FilterBridge) {
          FilterBridge.saveFilters(Number(minFare) || 0, preferredLocation || "");
        }
        Alert.alert('सफलता', 'फिल्टर्स सेव हो गए और इंजन में सेट हो गए!');
      }
    } catch (error) { Alert.alert('एरर', 'सेव नहीं हुआ!'); }
  };

  const sendPaymentRequest = async () => {
    if (!utr || utr.length < 6) return Alert.alert('गलती', 'सही UTR डालें!');
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/payment-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, utr, planDays: selectedPlanDays, amount: planAmount })
      });
      const data = await response.json();
      if (data.success) { Alert.alert('सफलता!', 'पेमेंट रिक्वेस्ट भेज दी गई है!'); setShowPayment(false); } 
      else Alert.alert('एरर', data.message);
    } catch (error) { Alert.alert('एरर', 'रिक्वेस्ट फेल!'); }
    setLoading(false);
  };

  const requestPerm = (type) => {
    if (Platform.OS !== 'android') return;
    try {
      if (type === 'accessibility') { Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS'); setPerms({...perms, accessibility: true}); }
      else if (type === 'overlay') { Linking.sendIntent('android.settings.action.MANAGE_OVERLAY_PERMISSION'); setPerms({...perms, overlay: true}); }
      else if (type === 'battery') { Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'); setPerms({...perms, battery: true}); }
      else if (type === 'notifications') { Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS'); setPerms({...perms, notifications: true}); }
    } catch (e) { Linking.openSettings(); }
  };

  const toggleServiceControl = (val) => {
    if (!isSubActive) return Alert.alert('प्रतिबंध', 'प्लान एक्टिव नहीं है!');
    if (val && (!perms.accessibility || !perms.overlay)) return Alert.alert('एरर', 'नीचे से Permissions चालू करें!');
    
    setServiceOn(val);
    
    if (FilterBridge) {
      FilterBridge.setServiceStatus(val);
    }
  };

  const toggleAppStatus = (index, val) => {
    const newApps = [...appsStatus];
    newApps[index].status = val;
    setAppsStatus(newApps);
    
    if (FilterBridge) {
      FilterBridge.updateAppStatus(newApps[index].id, val);
    }
  };

  if (isAppLoading) {
    return (
      <View style={[styles.container, {justifyContent: 'center', alignItems: 'center'}]}>
        <StatusBar barStyle="light-content" backgroundColor="#0B1319" />
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0B1319" />
        <View style={styles.authHeader}><Text style={styles.authLogoTxt}>Rider Accept</Text><Text style={styles.authSubTxt}>Premium driver console</Text></View>
        <View style={styles.authCard}>
          <Text style={styles.heading}>{isLoginMode ? 'Login to Rider Accept' : 'Create Account'}</Text>
          <TextInput style={styles.input} placeholder="Phone Number" placeholderTextColor="#888" keyboardType="numeric" maxLength={10} value={phone} onChangeText={setPhone} />
          <TextInput style={styles.input} placeholder="PIN" placeholderTextColor="#888" keyboardType="numeric" secureTextEntry={true} maxLength={4} value={pin} onChangeText={setPin} />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnTxt}>{isLoginMode ? 'LOGIN' : 'CREATE ACCOUNT'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={{marginTop: 15}}>
            <Text style={{color: '#4DA6FF', textAlign: 'center'}}>{isLoginMode ? 'New here? Create Account' : 'Have an account? Login'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (showPayment) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0B1319" />
        <ScrollView contentContainerStyle={{padding: 20}}>
          <Text style={[styles.heading, {fontSize: 24}]}>Activate your plan</Text>
          <Text style={{color: '#aaa', marginBottom: 20}}>Choose a plan, pay securely, and enter UTR.</Text>
          
          <View style={styles.planContainer}>
            {plansList.length > 0 ? plansList.map((plan, i) => (
              <TouchableOpacity key={i} style={[styles.planRow, selectedPlanDays === plan.days && styles.planRowActive]} onPress={() => {setSelectedPlanDays(plan.days); setPlanAmount(plan.price);}}>
                <View>
                  <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>{plan.name}</Text>
                  <Text style={{color: '#aaa', fontSize: 12}}>{plan.description}</Text>
                </View>
                <Text style={{color: '#FFD700', fontSize: 16, fontWeight: 'bold'}}>Rs {plan.price}</Text>
              </TouchableOpacity>
            )) : (
              <Text style={{color: '#aaa', textAlign: 'center', marginBottom: 15}}>प्लान लोड हो रहे हैं...</Text>
            )}
          </View>

          <View style={styles.qrBox}>
            {paymentInfo.qrUrl ? <Image source={{uri: paymentInfo.qrUrl}} style={{width: 150, height: 150, marginBottom: 10}}/> : <Text style={{color:'#fff', marginBottom:10}}>QR Loading...</Text>}
            <Text style={{color: '#00E676', fontWeight: 'bold', fontSize: 16}}>{paymentInfo.upiId}</Text>
            <Text style={{color: '#aaa', fontSize: 14, marginTop: 5}}>Amount: Rs {planAmount}</Text>
          </View>

          <TextInput style={styles.input} placeholder="Enter 12-Digit UTR Number" placeholderTextColor="#888" keyboardType="numeric" value={utr} onChangeText={setUtr} />
          <TouchableOpacity style={styles.primaryBtn} onPress={sendPaymentRequest} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnTxt}>Submit Payment</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, {marginTop: 15}]} onPress={() => setShowPayment(false)}>
            <Text style={styles.secondaryBtnTxt}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1319" />
      <View style={styles.mainHeader}>
        <View><Text style={styles.authLogoTxt}>Rider Accept</Text><Text style={styles.authSubTxt}>Premium driver console</Text></View>
        <TouchableOpacity style={styles.profileIcon}><Text style={{color:'#000', fontWeight:'bold'}}>PRO</Text></TouchableOpacity>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 80}}>
        {activeTab === 'Dashboard' && (
          <View style={styles.tabContent}>
            <View style={styles.profitCard}>
              <Text style={{color: '#00E676', fontSize: 12, fontWeight: 'bold'}}>LIVE DRIVER CONSOLE</Text>
              <Text style={{color: '#fff', fontSize: 28, fontWeight: 'bold', marginVertical: 5}}>Profit Rs 0</Text>
              <Text style={{color: '#aaa', fontSize: 12}}>0 accepted from 0 detected orders today</Text>
              <View style={{position: 'absolute', top: 15, right: 15, backgroundColor: serviceOn ? '#00E676' : '#FF4444', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5}}>
                <Text style={{color: '#000', fontWeight: 'bold'}}>{serviceOn ? 'ON' : 'OFF'}</Text>
              </View>
            </View>

            {!isSubActive && (
              <TouchableOpacity style={styles.planBanner} onPress={() => setShowPayment(true)}>
                <View style={styles.planBadge}><Text style={{color: '#FFD700', fontWeight: 'bold'}}>PLAN</Text></View>
                <View style={{flex: 1, marginLeft: 15}}>
                  <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>Activate Plan</Text>
                  <Text style={{color: '#aaa', fontSize: 12}}>Choose a plan below and pay securely</Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Service Control</Text>
              <View style={styles.rowBetween}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <View style={[styles.statusDot, {backgroundColor: serviceOn ? '#00E676' : '#555'}]} />
                  <View style={{marginLeft: 15}}>
                    <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>{serviceOn ? 'Service Active' : 'Service Stopped'}</Text>
                    <Text style={{color: '#aaa', fontSize: 12}}>{isSubActive ? 'Ready to accept rides' : 'Activate a plan first'}</Text>
                  </View>
                </View>
                <Switch value={serviceOn} onValueChange={toggleServiceControl} trackColor={{ false: "#333", true: "#00E676" }} thumbColor={"#fff"} />
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Fare Range & Location</Text>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <TextInput style={[styles.input, {flex: 0.48}]} placeholder="Min Rs" placeholderTextColor="#888" keyboardType="numeric" value={minFare} onChangeText={setMinFare} />
                <TextInput style={[styles.input, {flex: 0.48}]} placeholder="Max Rs (Opt)" placeholderTextColor="#888" keyboardType="numeric" value={maxFare} onChangeText={setMaxFare} />
              </View>
              <TextInput style={[styles.input, {marginTop: 10}]} placeholder="Preferred Location (e.g. Kanpur)" placeholderTextColor="#888" value={preferredLocation} onChangeText={setPreferredLocation} />
              <TouchableOpacity style={[styles.primaryBtn, {marginTop: 10}]} onPress={saveFilters}><Text style={styles.primaryBtnTxt}>SAVE FILTERS</Text></TouchableOpacity>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Permissions</Text>
              {[
                { key: 'accessibility', icon: '🚹', title: 'Accessibility Service', desc: 'Tap to enable (Required for auto click)' },
                { key: 'overlay', icon: '📱', title: 'Overlay Permission', desc: 'Required to display over other apps' },
                { key: 'battery', icon: '🔋', title: 'Battery Optimization', desc: 'Tap to exempt from battery saving' },
                { key: 'notifications', icon: '🔔', title: 'Notifications', desc: 'Tap to allow notifications' },
              ].map((p, index) => (
                <View key={index} style={styles.permRow}>
                  <View style={styles.permIconBox}><Text>{p.icon}</Text></View>
                  <View style={{flex: 1, marginLeft: 15}}>
                    <Text style={{color: '#fff', fontSize: 15, fontWeight: 'bold'}}>{p.title}</Text>
                    <Text style={{color: '#aaa', fontSize: 12}}>{p.desc}</Text>
                  </View>
                  <TouchableOpacity style={[styles.fixBtn, perms[p.key] && styles.fixBtnOk]} onPress={() => requestPerm(p.key)}>
                    <Text style={styles.fixBtnTxt}>{perms[p.key] ? 'Done' : 'Fix'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'History' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Today's Performance</Text>
            <View style={styles.profitCard}>
              <Text style={{color: '#fff', fontSize: 22, fontWeight: 'bold'}}>Ride history</Text>
              <Text style={{color: '#aaa', fontSize: 12, marginBottom: 15}}>0 accepted | 0 rejected | 0 skipped</Text>
              <View style={styles.rowBetween}>
                <View style={{alignItems: 'center'}}><Text style={{color: '#00BFFF', fontSize: 24, fontWeight: 'bold'}}>0</Text><Text style={{color: '#aaa'}}>Detected</Text></View>
                <View style={{alignItems: 'center'}}><Text style={{color: '#00E676', fontSize: 24, fontWeight: 'bold'}}>0</Text><Text style={{color: '#aaa'}}>Accepted</Text></View>
                <View style={{alignItems: 'center'}}><Text style={{color: '#FFD700', fontSize: 24, fontWeight: 'bold'}}>0</Text><Text style={{color: '#aaa'}}>Value</Text></View>
              </View>
            </View>
            <Text style={{color: '#aaa', textAlign: 'center', marginTop: 50}}>No detected rides yet.</Text>
          </View>
        )}

        {activeTab === 'Apps' && (
          <View style={styles.tabContent}>
            <View style={[styles.planBanner, {backgroundColor: '#1E2D24', borderColor: '#00E676', borderWidth: 1}]}>
              <View style={[styles.planBadge, {backgroundColor: '#00E676'}]}><Text style={{color: '#000', fontWeight: 'bold'}}>ON</Text></View>
              <View style={{flex: 1, marginLeft: 15}}>
                <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>Detection ready</Text>
                <Text style={{color: '#aaa', fontSize: 12}}>Supported apps listed below.</Text>
              </View>
            </View>
            <View style={{marginTop: 15}}>
              {appsStatus.map((app, index) => (
                <View key={index} style={styles.appRow}>
                  <View style={{flex: 1}}>
                    <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>{app.name}</Text>
                    <Text style={{color: '#aaa', fontSize: 12}}>{app.desc}</Text>
                  </View>
                  <Switch 
                    value={app.status} 
                    onValueChange={(val) => toggleAppStatus(index, val)}
                    trackColor={{ false: "#333", true: "#00E676" }} thumbColor={"#fff"}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'Profile' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionCard}>
              <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>Phone Number</Text>
              <Text style={{color: '#aaa', marginBottom: 15}}>{phone}</Text>
              <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>Plan Status</Text>
              <Text style={{color: isSubActive ? '#00E676' : '#FF4444', fontWeight: 'bold'}}>{isSubActive ? 'Active' : 'No active plan'}</Text>
            </View>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleLogout}>
              <Text style={[styles.secondaryBtnTxt, {color: '#FF4444'}]}>SIGN OUT</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        {['Dashboard', 'History', 'Apps', 'Profile'].map((tab) => (
          <TouchableOpacity key={tab} style={styles.navItem} onPress={() => setActiveTab(tab)}>
            <Text style={{fontSize: 20, marginBottom: 2}}>{tab === 'Dashboard' ? '🎛️' : tab === 'History' ? '🕒' : tab === 'Apps' ? '📱' : '👤'}</Text>
            <Text style={{color: activeTab === tab ? '#00E676' : '#888', fontSize: 10, fontWeight: 'bold'}}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1319' },
  authHeader: { padding: 40, alignItems: 'center', marginTop: 20 },
  authLogoTxt: { color: '#FFD700', fontSize: 28, fontWeight: 'bold' },
  authSubTxt: { color: '#aaa', fontSize: 14 },
  authCard: { flex: 1, backgroundColor: '#111B21', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25 },
  heading: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: { backgroundColor: '#1E2A32', color: '#fff', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 15, borderWidth: 1, borderColor: '#2A3942' },
  primaryBtn: { backgroundColor: '#FFD700', padding: 15, borderRadius: 10, alignItems: 'center' },
  primaryBtnTxt: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  secondaryBtn: { backgroundColor: '#1E2A32', padding: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2A3942' },
  secondaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#111B21', borderBottomWidth: 1, borderBottomColor: '#1E2A32' },
  profileIcon: { backgroundColor: '#FFD700', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  tabContent: { padding: 15 },
  profitCard: { backgroundColor: '#111B21', padding: 20, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#1E2A32' },
  planBanner: { flexDirection: 'row', backgroundColor: '#1E2A32', padding: 15, borderRadius: 15, alignItems: 'center', marginBottom: 15 },
  planBadge: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#332700', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FFD700' },
  sectionCard: { backgroundColor: '#111B21', padding: 15, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#1E2A32' },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusDot: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  permRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E2A32', padding: 12, borderRadius: 10, marginBottom: 10 },
  permIconBox: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#2A3942', justifyContent: 'center', alignItems: 'center' },
  fixBtn: { backgroundColor: 'rgba(255, 68, 68, 0.2)', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#FF4444' },
  fixBtnOk: { backgroundColor: 'rgba(0, 230, 118, 0.2)', borderColor: '#00E676' },
  fixBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  appRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1E2A32' },
  planContainer: { marginBottom: 20 },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E2A32', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: 'transparent' },
  planRowActive: { borderColor: '#FFD700', backgroundColor: '#332700' },
  qrBox: { backgroundColor: '#1E2A32', padding: 20, borderRadius: 15, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#2A3942' },
  bottomNav: { position: 'absolute', bottom: 0, width: '100%', flexDirection: 'row', backgroundColor: '#111B21', borderTopWidth: 1, borderTopColor: '#1E2A32', paddingBottom: Platform.OS === 'ios' ? 20 : 0 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 12 }
});
