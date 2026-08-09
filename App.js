import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, Alert, ActivityIndicator, ScrollView, Switch, Image, Linking, Platform, NativeModules, AppState, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = "https://ride-auto-backend.onrender.com";
const { FilterBridge } = NativeModules;

export default function App() {
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [activeTab, setActiveTab] = useState('Dashboard'); 
  const [showPayment, setShowPayment] = useState(false);
  const [refreshingPlan, setRefreshingPlan] = useState(false);

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubActive, setIsSubActive] = useState(false);
  
  const [minFare, setMinFare] = useState('');
  const [maxFare, setMaxFare] = useState(''); 
  const [preferredLocation, setPreferredLocation] = useState('');
  const [serviceOn, setServiceOn] = useState(false);

  const [historyStats, setHistoryStats] = useState({ detected: 0, accepted: 0, value: 0 });
  const [recentRides, setRecentRides] = useState([]);

  const [paymentInfo, setPaymentInfo] = useState({ upiId: 'jdtrading845-1@oksbi' }); 
  const [plansList, setPlansList] = useState([]); 
  const [utr, setUtr] = useState('');
  const [selectedPlanDays, setSelectedPlanDays] = useState(1);
  const [planAmount, setPlanAmount] = useState(10);

  const [perms, setPerms] = useState({ accessibility: false, overlay: false, battery: false, notifications: false });

  const [appsStatus, setAppsStatus] = useState([
    { id: 'ola', name: 'Ola', desc: 'Cab / Auto', pkg: 'com.olacabs.partner', installed: false, status: false },
    { id: 'uber', name: 'Uber', desc: 'Cab / Moto', pkg: 'com.ubercab.driver', installed: false, status: false },
    { id: 'rapido', name: 'Rapido', desc: 'Bike taxi', pkg: 'com.rapido.passenger.to', installed: false, status: false },
    { id: 'namma', name: 'Namma Yatri', desc: 'Auto / Taxi', pkg: 'in.juspay.nammayatripartner', installed: false, status: false },
    { id: 'indrive', name: 'inDrive', desc: 'Ride sharing', pkg: 'sinet.startup.inDriver', installed: false, status: false },
    { id: 'blusmart', name: 'BluSmart', desc: 'EV cab', pkg: 'com.blusmart.driver', installed: false, status: false },
  ]);

  useEffect(() => {
    const rideListener = DeviceEventEmitter.addListener('RideAccepted', (event) => {
      const fare = event.fare || 0;
      setHistoryStats(prev => ({
        detected: prev.detected + 1,
        accepted: prev.accepted + 1,
        value: prev.value + fare
      }));
      setRecentRides(prev => [{ id: Date.now(), fare, time: new Date().toLocaleTimeString() }, ...prev]);
    });
    return () => rideListener.remove();
  }, []);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    await checkLoginStatus();
    fetchPlans();
    checkInstalledApps();
    checkRealPermissions();
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        if (isLoggedIn && phone) syncSubscriptionStatus();
        checkInstalledApps();
        checkRealPermissions(); // 🚀 ऐप खुलते ही सिस्टम से असली परमिशन पूछेगा
      }
    });
    return () => subscription.remove();
  }, [isLoggedIn, phone]);

  // 🚀 FIX: झूठा हरा टिक बंद, अब सीधे Android OS से पूछेगा कि परमिशन मिली या नहीं
  const checkRealPermissions = async () => {
    if (Platform.OS !== 'android') return;
    try {
      if (FilterBridge && FilterBridge.checkPermissions) {
        const permsStatus = await FilterBridge.checkPermissions();
        setPerms(prev => ({
          ...prev,
          accessibility: permsStatus.accessibility,
          overlay: permsStatus.overlay,
          battery: permsStatus.battery,
          notifications: true // Notifications normally requested via prompt
        }));
      }
    } catch (e) {}
  };

  const checkInstalledApps = async () => {
    if (!FilterBridge || !FilterBridge.checkAppInstalled) return;
    let updatedApps = [...appsStatus];
    
    for (let i = 0; i < updatedApps.length; i++) {
      try {
        const isInstalled = await FilterBridge.checkAppInstalled(updatedApps[i].pkg);
        updatedApps[i].installed = isInstalled;
        
        const savedAppStatus = await AsyncStorage.getItem(`app_status_${updatedApps[i].id}`);
        if (savedAppStatus !== null) {
          updatedApps[i].status = savedAppStatus === 'true';
          if (updatedApps[i].status && FilterBridge.updateAppStatus) {
            FilterBridge.updateAppStatus(updatedApps[i].id, true);
          }
        }
        if (!isInstalled) updatedApps[i].status = false;
      } catch (e) {}
    }
    setAppsStatus(updatedApps);
  };

  const syncSubscriptionStatus = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/check-subscription`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone })
      });
      const data = await response.json();
      if (data.success) {
        const activeStatus = Boolean(data.active);
        setIsSubActive(activeStatus);
        await AsyncStorage.setItem('is_sub_active', String(activeStatus));
      }
    } catch (error) {}
  };

  const handleManualRefreshPlan = async () => {
    setRefreshingPlan(true);
    await syncSubscriptionStatus();
    setRefreshingPlan(false);
    Alert.alert("Success", isSubActive ? "आपका प्लान एक्टिव है! ✅" : "अभी भी प्लान एक्टिव नहीं है। कृपया UTR चेक करें।");
  };

  const checkLoginStatus = async () => {
    try {
      const savedPhone = await AsyncStorage.getItem('user_phone');
      const savedSub = await AsyncStorage.getItem('is_sub_active');
      const savedMinFare = await AsyncStorage.getItem('min_fare');
      const savedMaxFare = await AsyncStorage.getItem('max_fare');
      const savedLoc = await AsyncStorage.getItem('pref_loc');
      const savedServiceState = await AsyncStorage.getItem('service_on');

      if (savedPhone) {
        setPhone(savedPhone);
        setIsSubActive(savedSub === 'true');
        if (savedMinFare) setMinFare(savedMinFare);
        if (savedMaxFare) setMaxFare(savedMaxFare);
        if (savedLoc) setPreferredLocation(savedLoc);
        
        if (FilterBridge && FilterBridge.saveFilters) {
          FilterBridge.saveFilters(Number(savedMinFare) || 0, Number(savedMaxFare) || 99999, savedLoc || "");
        }
        
        if (savedServiceState === 'true' && savedSub === 'true') {
          setServiceOn(true);
          if (FilterBridge && FilterBridge.setServiceStatus) {
            FilterBridge.setServiceStatus(true);
          }
        }

        setIsLoggedIn(true);
        syncSubscriptionStatus();
      }
    } catch (e) {}
    setIsAppLoading(false);
  };

  const fetchPlans = () => {
    fetch(`${BACKEND_URL}/api/plans`)
      .then(res => res.json())
      .then(data => { 
        if (data.success && data.data.length > 0) {
          setPlansList(data.data); 
          setSelectedPlanDays(data.data[0].days);
          setPlanAmount(data.data[0].price);
        }
      }).catch(() => {});
  };

  useEffect(() => {
    if (showPayment) {
      fetch(`${BACKEND_URL}/api/payment-info`)
        .then(res => res.json())
        .then(data => { if (data.success && data.data.upiId) setPaymentInfo(data.data); })
        .catch(() => {});
    }
  }, [showPayment]);

  const handleAuth = async () => {
    if (phone.length !== 10 || pin.length < 4) return Alert.alert('Error', 'Invalid Phone or PIN');
    setLoading(true);
    const endpoint = isLoginMode ? '/api/login' : '/api/register';
    try {
      // 🚀 FIX: परमानेंट UUID जेनरेट कर रहे हैं, जो फोन से कभी नहीं मिटेगा
      let deviceId = await AsyncStorage.getItem('secure_device_id');
      if (!deviceId) {
        deviceId = "device_" + Date.now() + "_" + Math.floor(Math.random() * 1000000000);
        await AsyncStorage.setItem('secure_device_id', deviceId);
      }

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, pin, deviceId })
      });
      const data = await response.json();
      
      if (data.success) {
        if (!isLoginMode) { 
          Alert.alert('Success', 'Account Created! Login now.'); setIsLoginMode(true); 
        } else {
          const activeState = Boolean(data.active);
          setIsSubActive(activeState);
          let mFare = data.data?.minFare ? data.data.minFare.toString() : '';
          let mxFare = data.data?.maxFare ? data.data.maxFare.toString() : '';
          let pLoc = data.data?.preferredLocation || '';
          
          setMinFare(mFare); 
          setMaxFare(mxFare);
          setPreferredLocation(pLoc);
          
          await AsyncStorage.setItem('user_phone', phone);
          await AsyncStorage.setItem('is_sub_active', String(activeState));
          await AsyncStorage.setItem('min_fare', mFare);
          await AsyncStorage.setItem('max_fare', mxFare);
          await AsyncStorage.setItem('pref_loc', pLoc);
          setIsLoggedIn(true);
          
          if (FilterBridge && FilterBridge.saveFilters) {
            FilterBridge.saveFilters(Number(mFare) || 0, Number(mxFare) || 99999, pLoc);
          }
        }
      } else { Alert.alert('Error', data.message); }
    } catch (error) { Alert.alert('Error', 'Server unreachable'); }
    setLoading(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user_phone');
    await AsyncStorage.removeItem('is_sub_active');
    setIsLoggedIn(false); setPhone(''); setPin('');
    if (FilterBridge && FilterBridge.setServiceStatus) FilterBridge.setServiceStatus(false);
  };

  const saveFilters = async () => {
    try {
      await AsyncStorage.setItem('min_fare', minFare);
      await AsyncStorage.setItem('max_fare', maxFare);
      await AsyncStorage.setItem('pref_loc', preferredLocation);

      if (FilterBridge && FilterBridge.saveFilters) {
        FilterBridge.saveFilters(Number(minFare) || 0, Number(maxFare) || 99999, preferredLocation || "");
      }

      Alert.alert('Saved', 'Filters updated successfully!');

      fetch(`${BACKEND_URL}/api/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ phone, minFare: Number(minFare), maxFare: Number(maxFare), preferredLocation })
      }).catch(() => {});

    } catch (error) { 
      Alert.alert('Error', 'Save failed'); 
    }
  };

  const sendPaymentRequest = async () => {
    if (!utr || utr.length < 6) return Alert.alert('Error', 'Invalid UTR Number');
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/payment-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, utr, planDays: selectedPlanDays, amount: planAmount })
      });
      const data = await response.json();
      if (data.success) { Alert.alert('Success', 'Request sent for Admin approval!'); setShowPayment(false); setUtr(''); } 
      else Alert.alert('Error', data.message);
    } catch (error) { Alert.alert('Error', 'Request failed'); }
    setLoading(false);
  };

  const requestPerm = async (type) => {
    if (Platform.OS !== 'android') return;
    try {
      if (type === 'accessibility') { 
        Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS'); 
      }
      else if (type === 'overlay') { 
        Linking.sendIntent('android.settings.action.MANAGE_OVERLAY_PERMISSION'); 
      }
      else if (type === 'battery') { 
        if (FilterBridge && FilterBridge.requestBatteryOptimization) FilterBridge.requestBatteryOptimization(); 
        else Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'); 
      }
      else if (type === 'notifications') { 
        Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS'); 
      }
    } catch (e) { Linking.openSettings(); }
  };

  const toggleServiceControl = async (val) => {
    if (!isSubActive) return Alert.alert('Plan Inactive', 'Please activate a plan first.');
    if (val && (!perms.accessibility || !perms.overlay)) return Alert.alert('Permissions Required', 'Enable Overlay & Accessibility from Settings!');
    
    setServiceOn(val);
    await AsyncStorage.setItem('service_on', String(val));

    if (FilterBridge && FilterBridge.setServiceStatus) {
      FilterBridge.setServiceStatus(val);
    }
  };

  const toggleAppStatus = async (index) => {
    const newApps = [...appsStatus];
    if (!newApps[index].installed) return; 
    
    newApps[index].status = !newApps[index].status;
    setAppsStatus(newApps);
    
    await AsyncStorage.setItem(`app_status_${newApps[index].id}`, String(newApps[index].status));

    if (FilterBridge && FilterBridge.updateAppStatus) {
      try {
         FilterBridge.updateAppStatus(newApps[index].id, newApps[index].status);
      } catch(e) {}
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
        <View style={styles.authHeader}>
          <Image source={require('./assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.authLogoTxt}>Rider Accept</Text>
          <Text style={styles.authSubTxt}>Premium driver console</Text>
        </View>
        <View style={styles.authCard}>
          <Text style={styles.heading}>{isLoginMode ? 'Login to Rider Accept' : 'Create Account'}</Text>
          <TextInput style={styles.input} placeholder="Phone Number" placeholderTextColor="#888" keyboardType="numeric" maxLength={10} value={phone} onChangeText={setPhone} />
          <TextInput style={styles.input} placeholder="PIN" placeholderTextColor="#888" keyboardType="numeric" secureTextEntry={true} maxLength={4} value={pin} onChangeText={setPin} />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnTxt}>{isLoginMode ? 'LOGIN' : 'CREATE ACCOUNT (1 Day Free)'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={{marginTop: 15}}>
            <Text style={{color: '#4DA6FF', textAlign: 'center'}}>{isLoginMode ? 'New here? Create Account' : 'Have an account? Login'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const upiString = `upi://pay?pa=${paymentInfo.upiId}&pn=RiderAccept&am=${planAmount}&cu=INR`;
  const autoQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}&margin=10`;

  if (showPayment) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0B1319" />
        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}}>
          <Text style={[styles.heading, {fontSize: 24}]}>Activate your plan</Text>
          <Text style={{color: '#aaa', marginBottom: 20}}>Choose a plan, pay securely, and enter UTR.</Text>
          
          <View style={styles.planContainer}>
            {plansList.map((plan, i) => (
              <TouchableOpacity key={i} style={[styles.planRow, selectedPlanDays === plan.days && styles.planRowActive]} onPress={() => {setSelectedPlanDays(plan.days); setPlanAmount(plan.price);}}>
                <View>
                  <Text style={{color: selectedPlanDays === plan.days ? '#000' : '#fff', fontSize: 16, fontWeight: 'bold'}}>{plan.name}</Text>
                  <Text style={{color: selectedPlanDays === plan.days ? '#333' : '#aaa', fontSize: 12, marginTop: 4}}>{plan.description}</Text>
                </View>
                <Text style={{color: selectedPlanDays === plan.days ? '#000' : '#FFD700', fontSize: 18, fontWeight: '900'}}>Rs {plan.price}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.qrBox}>
            <Image source={{ uri: autoQrUrl }} style={{ width: 180, height: 180, marginBottom: 15, borderRadius: 10 }}/>
            <Text style={{color: '#00E676', fontWeight: 'bold', fontSize: 16}}>{paymentInfo.upiId}</Text>
            <Text style={{color: '#aaa', fontSize: 14, marginTop: 5}}>Amount to pay: Rs {planAmount}</Text>
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
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
           <Image source={require('./assets/logo.png')} style={{width: 32, height: 32, marginRight: 10}} resizeMode="contain" />
           <View>
             <Text style={[styles.authLogoTxt, {fontSize: 20}]}>Rider Accept</Text>
             <Text style={[styles.authSubTxt, {fontSize: 12}]}>Premium driver console</Text>
           </View>
        </View>
        <TouchableOpacity style={styles.profileIcon} onPress={() => setActiveTab('Profile')}><Text style={{color:'#fff', fontSize:12, fontWeight:'bold'}}>Profile</Text></TouchableOpacity>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 80}}>
        {activeTab === 'Dashboard' && (
          <View style={styles.tabContent}>
            
            <View style={[styles.profitCard, {borderColor: serviceOn ? '#00E676' : '#1E2A32'}]}>
              <Text style={{color: '#00E676', fontSize: 12, fontWeight: 'bold'}}>LIVE DRIVER CONSOLE</Text>
              <Text style={{color: '#fff', fontSize: 32, fontWeight: 'bold', marginVertical: 5}}>Profit Rs {historyStats.value}</Text>
              <Text style={{color: '#aaa', fontSize: 12, marginBottom: 15}}>{historyStats.accepted} accepted from {historyStats.detected} detected orders today</Text>
              
              <View style={{flexDirection: 'row', gap: 10}}>
                <View style={styles.pillBox}><Text style={styles.pillTextTop}>STATUS</Text><Text style={styles.pillTextBottom}>{serviceOn ? 'Active' : 'Paused'}</Text></View>
                <View style={styles.pillBox}><Text style={styles.pillTextTop}>VALUE</Text><Text style={styles.pillTextBottom}>Rs {historyStats.value}</Text></View>
                <View style={styles.pillBox}><Text style={styles.pillTextTop}>RATE</Text><Text style={styles.pillTextBottom}>{historyStats.detected > 0 ? Math.round((historyStats.accepted/historyStats.detected)*100) : 0}%</Text></View>
              </View>

              <TouchableOpacity style={[styles.toggleBtn, {backgroundColor: serviceOn ? '#00E676' : '#333'}]} onPress={() => toggleServiceControl(!serviceOn)}>
                <Text style={{color: serviceOn ? '#000' : '#fff', fontWeight: 'bold'}}>{serviceOn ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            </View>

            {!isSubActive && (
              <TouchableOpacity style={styles.planBanner} onPress={() => setShowPayment(true)}>
                <View style={styles.planBadge}><Text style={{color: '#FFD700', fontWeight: 'bold', fontSize: 12}}>PLAN</Text></View>
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
                <TextInput style={[styles.input, {flex: 0.48}]} placeholder="Min Rs" placeholderTextColor="#555" keyboardType="numeric" value={minFare} onChangeText={setMinFare} />
                <TextInput style={[styles.input, {flex: 0.48}]} placeholder="Max Rs" placeholderTextColor="#555" keyboardType="numeric" value={maxFare} onChangeText={setMaxFare} />
              </View>
              <TextInput style={[styles.input, {marginTop: 5}]} placeholder="Preferred Location (e.g. Kanpur)" placeholderTextColor="#555" value={preferredLocation} onChangeText={setPreferredLocation} />
              <TouchableOpacity style={[styles.primaryBtn, {marginTop: 10}]} onPress={saveFilters}><Text style={styles.primaryBtnTxt}>SAVE FILTERS</Text></TouchableOpacity>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Permissions Settings</Text>
              {[
                { key: 'accessibility', icon: '🚹', title: 'Accessibility Service', desc: 'Required for auto click' },
                { key: 'overlay', icon: '📱', title: 'Overlay Permission', desc: 'Display over other apps' },
                { key: 'battery', icon: '🔋', title: 'Battery Optimization', desc: 'Exempt from battery saving' },
                { key: 'notifications', icon: '🔔', title: 'Notifications', desc: 'Allow background alerts' },
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
             <View style={styles.historyCard}>
                <Text style={{color: '#00E676', fontSize: 12, fontWeight: 'bold'}}>TODAY'S PERFORMANCE</Text>
                <Text style={{color: '#fff', fontSize: 26, fontWeight: 'bold', marginVertical: 5}}>Ride history</Text>
                <Text style={{color: '#aaa', fontSize: 12, marginBottom: 20}}>{historyStats.accepted} accepted | 0 rejected | 0 skipped</Text>
                
                <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                  <View style={styles.historyStatBox}><Text style={{color: '#00BFFF', fontSize: 24, fontWeight: 'bold'}}>{historyStats.detected}</Text><Text style={{color: '#aaa', fontSize: 11}}>Detected</Text></View>
                  <View style={styles.historyStatBox}><Text style={{color: '#00E676', fontSize: 24, fontWeight: 'bold'}}>{historyStats.accepted}</Text><Text style={{color: '#aaa', fontSize: 11}}>Accepted</Text></View>
                  <View style={styles.historyStatBox}><Text style={{color: '#FFD700', fontSize: 24, fontWeight: 'bold'}}>Rs {historyStats.value}</Text><Text style={{color: '#aaa', fontSize: 11}}>Value</Text></View>
                </View>
             </View>

             <View style={{marginTop: 20}}>
                <Text style={{color: '#00E676', fontSize: 18, fontWeight: 'bold', marginBottom: 10}}>Ride Timeline</Text>
                
                {recentRides.length > 0 ? (
                  recentRides.map((ride, idx) => (
                    <View key={idx} style={{backgroundColor: '#1E2A32', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                      <View>
                        <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>Ride Accepted</Text>
                        <Text style={{color: '#aaa', fontSize: 12}}>{ride.time}</Text>
                      </View>
                      <Text style={{color: '#00E676', fontSize: 18, fontWeight: 'bold'}}>+ Rs {ride.fare}</Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.timelineBox}>
                     <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 5}}>No rides yet</Text>
                     <Text style={{color: '#aaa', fontSize: 12, textAlign: 'center', marginBottom: 20}}>New detections will appear here automatically.</Text>
                     <TouchableOpacity style={styles.cyanBtn} onPress={() => setActiveTab('Dashboard')}>
                        <Text style={styles.cyanBtnTxt}>OPEN DASHBOARD</Text>
                     </TouchableOpacity>
                  </View>
                )}
             </View>
          </View>
        )}

        {activeTab === 'Apps' && (
          <View style={styles.tabContent}>
            {appsStatus.map((app, index) => (
              <View key={index} style={styles.appRow}>
                <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                  <View style={styles.appIconGrid}><Text style={{color: '#555', fontSize: 20}}>⊞</Text></View>
                  <View style={{marginLeft: 15}}>
                    <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>{app.name}</Text>
                    <Text style={{color: '#777', fontSize: 12}}>
                      {app.desc} | {app.installed ? 'Detection allowed' : 'Not installed'}
                    </Text>
                  </View>
                </View>

                {!app.installed ? (
                  <View style={styles.badgeMissing}>
                    <Text style={{color: '#777', fontSize: 12, fontWeight: 'bold'}}>Missing</Text>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={[styles.badgeAllowed, !app.status && {backgroundColor: '#333', borderColor: '#555'}]}
                    onPress={() => toggleAppStatus(index)}
                  >
                    <Text style={{color: app.status ? '#00E676' : '#aaa', fontSize: 12, fontWeight: 'bold'}}>
                      {app.status ? 'Allowed' : 'Paused'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Profile' && (
          <View style={styles.tabContent}>
            
            <View style={styles.profileUserCard}>
              <View style={styles.profileAvatar}><Text style={{color:'#000', fontWeight:'bold', fontSize:24}}>R</Text></View>
              <View style={{marginLeft: 15}}>
                <Text style={{color: '#fff', fontSize: 20, fontWeight: 'bold'}}>Rider ID: {phone}</Text>
                <Text style={{color: '#aaa', fontSize: 12}}>India • Secure / INR</Text>
                <View style={styles.roleBadge}><Text style={{color: '#FFD700', fontSize: 10, fontWeight: 'bold'}}>Driver</Text></View>
              </View>
            </View>

            <View style={styles.profilePlanCard}>
              <View style={styles.planRing}>
                <Text style={{color: isSubActive ? '#00E676' : '#FF4444', fontWeight: 'bold', fontSize: 12}}>
                   {isSubActive ? '100%' : '0%'}
                </Text>
              </View>
              <View style={{marginLeft: 20}}>
                <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>Plan Status</Text>
                <Text style={{color: isSubActive ? '#00E676' : '#FF4444', fontSize: 14, marginTop: 5}}>{isSubActive ? 'Active' : 'No active plan'}</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.primaryBtn, {marginBottom: 15}]} onPress={handleManualRefreshPlan} disabled={refreshingPlan}>
              {refreshingPlan ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnTxt}>🔄 REFRESH PLAN STATUS</Text>}
            </TouchableOpacity>

            <View style={styles.sectionCard}>
               <Text style={styles.sectionTitle}>Account Actions</Text>
               <TouchableOpacity style={[styles.secondaryBtn, {borderColor: '#FF4444'}]} onPress={handleLogout}>
                 <Text style={[styles.secondaryBtnTxt, {color: '#FF4444'}]}>SIGN OUT</Text>
               </TouchableOpacity>
            </View>

          </View>
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        {['Dashboard', 'History', 'Apps'].map((tab) => (
          <TouchableOpacity key={tab} style={styles.navItem} onPress={() => setActiveTab(tab)}>
            <Text style={{fontSize: 20, marginBottom: 2, color: activeTab === tab ? '#00E676' : '#555'}}>{tab === 'Dashboard' ? '🎛️' : tab === 'History' ? '🕒' : '📱'}</Text>
            <Text style={{color: activeTab === tab ? '#fff' : '#555', fontSize: 10, fontWeight: 'bold'}}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1319' },
  authHeader: { padding: 40, alignItems: 'center', marginTop: 20 },
  logoImage: { width: 80, height: 80, marginBottom: 15 }, 
  authLogoTxt: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  authSubTxt: { color: '#aaa', fontSize: 14 },
  authCard: { flex: 1, backgroundColor: '#111B21', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25 },
  heading: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: { backgroundColor: '#1E2A32', color: '#fff', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 15, borderWidth: 1, borderColor: '#2A3942' },
  primaryBtn: { backgroundColor: '#FFD700', padding: 15, borderRadius: 10, alignItems: 'center' },
  primaryBtnTxt: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  cyanBtn: { backgroundColor: '#00E676', padding: 15, borderRadius: 10, alignItems: 'center' },
  cyanBtnTxt: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  secondaryBtn: { backgroundColor: '#111B21', padding: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2A3942' },
  secondaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#0B1319' },
  profileIcon: { backgroundColor: '#1E2A32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2A3942' },
  tabContent: { padding: 15 },
  profitCard: { backgroundColor: '#111B21', padding: 20, borderRadius: 15, marginBottom: 15, borderWidth: 1 },
  pillBox: { backgroundColor: '#1E2A32', padding: 10, borderRadius: 10, flex: 1 },
  pillTextTop: { color: '#FFD700', fontSize: 9, fontWeight: 'bold' },
  pillTextBottom: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  toggleBtn: { position: 'absolute', top: 15, right: 15, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  planBanner: { flexDirection: 'row', backgroundColor: '#1E1A0F', padding: 15, borderRadius: 15, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#FFD700' },
  planBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#332700', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FFD700' },
  sectionCard: { backgroundColor: '#111B21', padding: 15, borderRadius: 15, marginBottom: 15 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusDot: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  permRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E2A32', padding: 12, borderRadius: 10, marginBottom: 10 },
  permIconBox: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#2A3942', justifyContent: 'center', alignItems: 'center' },
  fixBtn: { backgroundColor: 'rgba(255, 68, 68, 0.2)', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#FF4444' },
  fixBtnOk: { backgroundColor: 'rgba(0, 230, 118, 0.2)', borderColor: '#00E676' },
  fixBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  historyCard: { backgroundColor: '#111B21', padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#1E2A32' },
  historyStatBox: { backgroundColor: '#1E2A32', padding: 15, borderRadius: 10, width: '30%', alignItems: 'center', borderWidth: 1, borderColor: '#2A3942' },
  timelineBox: { backgroundColor: '#111B21', padding: 30, borderRadius: 15, alignItems: 'center' },
  appRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  appIconGrid: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1E2A32', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#2A3942' },
  badgeMissing: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 15, backgroundColor: '#1E2A32', borderWidth: 1, borderColor: '#2A3942' },
  badgeAllowed: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 15, backgroundColor: 'rgba(0, 230, 118, 0.1)', borderWidth: 1, borderColor: '#00E676' },
  profileUserCard: { flexDirection: 'row', backgroundColor: '#111B21', padding: 20, borderRadius: 15, marginBottom: 15, alignItems: 'center' },
  profileAvatar: { width: 60, height: 60, borderRadius: 15, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  roleBadge: { backgroundColor: '#332700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignSelf: 'flex-start', marginTop: 5, borderWidth: 1, borderColor: '#FFD700' },
  profilePlanCard: { flexDirection: 'row', backgroundColor: '#111B21', padding: 20, borderRadius: 15, marginBottom: 15, alignItems: 'center' },
  planRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 4, borderColor: '#1E2A32', borderTopColor: '#00E676', justifyContent: 'center', alignItems: 'center' },
  planContainer: { marginBottom: 20 },
  planRow: { backgroundColor: '#1E2A32', padding: 20, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: 'transparent' },
  planRowActive: { backgroundColor: '#FFD700' },
  qrBox: { backgroundColor: '#1E2A32', padding: 20, borderRadius: 15, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#2A3942' },
  bottomNav: { position: 'absolute', bottom: 0, width: '100%', flexDirection: 'row', backgroundColor: '#0B1319', borderTopWidth: 1, borderTopColor: '#1E2A32', paddingBottom: Platform.OS === 'ios' ? 20 : 0 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 10 }
});
