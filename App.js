import { StatusBar } from 'expo-status-bar';
import RecorderScreen from './components/RecorderScreen';

export default function App() {
  return (
    <>
      <RecorderScreen />
      <StatusBar style="auto" />
    </>
  );
}
