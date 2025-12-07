import React from 'react';

export enum ViewState {
  HOME = 'HOME',
  DEBUG = 'DEBUG',
  EXPLORE = 'EXPLORE',
  LEARN = 'LEARN',
  PAIR = 'PAIR'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // Base64 data URI
  timestamp: Date;
  isError?: boolean;
}

export interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  colorClass: string;
}

export enum GeminiModel {
  TEXT = 'gemini-2.5-flash',
  LIVE = 'gemini-2.5-flash-native-audio-preview-09-2025'
}