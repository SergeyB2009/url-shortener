import { ShortenForm } from './components/ShortenForm';
import { StatsForm } from './components/StatsForm';
import './styles.css';

export const App = (): JSX.Element => (
  <div className="container">
    <h1>URL Shortener</h1>
    <ShortenForm />
    <StatsForm />
  </div>
);