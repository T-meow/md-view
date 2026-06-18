import App from './App.svelte';
import { mount } from 'svelte';
import './app.css';

const app = mount(App, {
  target: document.getElementById('app') as HTMLElement
});

export default app;
