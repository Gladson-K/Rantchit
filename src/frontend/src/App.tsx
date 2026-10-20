import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { HomeScreen } from './pages/HomeScreen';
import { RoomScreen } from './pages/RoomScreen';
import { ErrorScreen } from './pages/ErrorScreen';

export default function App() {
  return (
    <div className="crt min-h-screen bg-arcade-bg text-arcade-text font-mono">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/room/:roomId" element={<RoomScreen />} />
        <Route path="/error" element={<ErrorScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
