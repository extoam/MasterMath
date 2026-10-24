import { useState } from 'react';
import { saveChildName } from '../db/repo';
import '../ui/Home.css';
import { Logo } from '../ui/Logo';

interface Props {
  onDone: (name: string) => void;
}

/** First opening: her name, written on every sheet afterwards. */
export function Welcome({ onDone }: Props) {
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const ready = name.trim().length > 0;
  const save = async () => {
    if (!ready) return;
    try {
      await saveChildName(name);
      onDone(name.trim());
    } catch {
      setFailed(true);
    }
  };
  return (
    <main className="home welcome">
      <div className="welcome-logo">
        <Logo size={96} />
        <span className="wordmark" data-testid="welcome-wordmark">
          MasterMath
        </span>
      </div>
      <section className="card task">
        <p className="eyebrow">Welcome</p>
        <h2>What’s your name?</h2>
        <p className="detail">It goes on the top of every sheet, like on paper.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            className="name-input"
            data-testid="name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoComplete="off"
            autoCapitalize="words"
            aria-label="Your name"
            autoFocus
          />
          <button className="primary" type="submit" disabled={!ready} data-testid="name-save">
            Let’s start
          </button>
        </form>
        {failed && <p className="note">That didn’t save. Try again.</p>}
      </section>
    </main>
  );
}
