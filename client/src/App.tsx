import { AppShell } from "./screens/AppShell";

const USER_ID = import.meta.env.VITE_USER_ID;

export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>SkiPrepCoach</h1>
      </header>
      <main className="app__main">
        <AppShell userId={USER_ID} />
      </main>
    </div>
  );
}
