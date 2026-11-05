// Branchement du formulaire de connexion (page publique `/admin/login`).
import { type LoginOutcome, submitLogin } from './submit-login';

const MESSAGES: Record<Exclude<LoginOutcome, 'ok'>, string> = {
  refused: 'Identifiants ou code invalides.',
  invalid: 'Le code doit comporter 6 chiffres.',
  error: 'Service indisponible, réessayez plus tard.',
};

const form = document.querySelector<HTMLFormElement>('#login')!;
const message = document.querySelector<HTMLParagraphElement>('#message')!;
const button = form.querySelector<HTMLButtonElement>('button')!;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const field = (name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
  };
  button.disabled = true;
  message.textContent = '';
  void submitLogin((url, init) => fetch(url, init), {
    email: field('email'),
    password: field('password'),
    code: field('code'),
  }).then((outcome) => {
    if (outcome === 'ok') {
      window.location.assign('/admin/');
      return;
    }
    message.textContent = MESSAGES[outcome];
    button.disabled = false;
  });
});
