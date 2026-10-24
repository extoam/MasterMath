import { useEffect, useRef, useState } from 'react';
import { loadTemplates } from '../db/repo';
import { Calibrate } from '../screens/Calibrate';
import { RecogniserCheck } from '../screens/RecogniserCheck';
import { TryBox } from '../screens/TryBox';
import { Today } from '../screens/Today';
import { createTemplateStore } from './inkSetup';

type Screen = 'home' | 'try' | 'calibrate' | 'check';

export function App() {
  const storeRef = useRef(createTemplateStore());
  const [screen, setScreen] = useState<Screen>('home');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTemplates()
      .then((templates) => {
        if (cancelled) return;
        storeRef.current.load(templates);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        console.error('Could not load templates', err);
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const home = () => setScreen('home');

  if (!loaded) {
    return <main className="screen" />;
  }

  switch (screen) {
    case 'try':
      return <TryBox store={storeRef.current} onBack={home} />;
    case 'calibrate':
      return <Calibrate store={storeRef.current} onBack={home} />;
    case 'check':
      return <RecogniserCheck store={storeRef.current} onBack={home} onCalibrate={() => setScreen('calibrate')} />;
    case 'home':
      return (
        <Today
          store={storeRef.current}
          onCalibrate={() => setScreen('calibrate')}
          onTry={() => setScreen('try')}
          onCheck={() => setScreen('check')}
        />
      );
  }
}
