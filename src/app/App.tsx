import { useEffect, useRef, useState } from 'react';
import { loadTemplates } from '../db/repo';
import { Calibrate } from '../screens/Calibrate';
import { TryBox } from '../screens/TryBox';
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
      return (
        <main className="screen stack">
          <p className="muted">Coming next.</p>
          <button onClick={home}>Back</button>
        </main>
      );
    case 'home':
      return (
        <main className="screen stack">
          <h1>ComeOnMath</h1>
          <div className="stack">
            <button className="primary" onClick={() => setScreen('calibrate')}>
              Teach the app your handwriting
            </button>
            <button onClick={() => setScreen('try')}>Try it</button>
            <button onClick={() => setScreen('check')}>Handwriting check</button>
          </div>
        </main>
      );
  }
}
