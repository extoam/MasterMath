import { useEffect, useRef, useState } from 'react';
import { loadSettings, loadTemplates } from '../db/repo';
import { Calibrate } from '../screens/Calibrate';
import { RecogniserCheck } from '../screens/RecogniserCheck';
import { TryBox } from '../screens/TryBox';
import { Today } from '../screens/Today';
import { Welcome } from '../screens/Welcome';
import { createTemplateStore } from './inkSetup';

type Screen = 'home' | 'try' | 'calibrate' | 'check';

export function App() {
  const storeRef = useRef(createTemplateStore());
  const [screen, setScreen] = useState<Screen>('home');
  const [loaded, setLoaded] = useState(false);
  const [childName, setChildName] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadTemplates(), loadSettings()])
      .then(([templates, settings]) => {
        if (cancelled) return;
        storeRef.current.load(templates);
        setChildName(settings.childName);
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

  if (!childName) {
    return <Welcome onDone={setChildName} />;
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
          childName={childName}
          onCalibrate={() => setScreen('calibrate')}
          onTry={() => setScreen('try')}
          onCheck={() => setScreen('check')}
        />
      );
  }
}
