import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { NativeCallState } from './useNativeCall.types';
export function NativeCallOverlay({ call }: { call: NativeCallState }) {
 const colors = useColors();
 if (!call.error) return null;
 return <Modal visible transparent animationType="fade" onRequestClose={call.hangUp}><View style={styles.scrim}><View style={[styles.card,{backgroundColor:colors.card}]}><Text style={[styles.title,{color:colors.foreground}]}>Chamadas no navegador</Text><Text style={[styles.message,{color:colors.mutedForeground}]}>{call.error}</Text><Pressable accessibilityRole="button" onPress={call.hangUp} style={[styles.button,{backgroundColor:colors.primary}]}><Text style={{color:colors.primaryForeground,fontWeight:'700'}}>Entendi</Text></Pressable></View></View></Modal>;
}
const styles=StyleSheet.create({scrim:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:'#0008'},card:{width:'100%',maxWidth:420,borderRadius:20,padding:24,gap:14},title:{fontSize:20,fontWeight:'700'},message:{fontSize:15,lineHeight:22},button:{minHeight:48,borderRadius:14,alignItems:'center',justifyContent:'center'}});
