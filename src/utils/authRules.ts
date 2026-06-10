export type ValidationResult = { valid: boolean; error?: string };

export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim() === '') {
    return { valid: false, error: 'email_obrigatorio' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { valid: false, error: 'email_invalido' };
  }
  return { valid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (!password || password === '') {
    return { valid: false, error: 'senha_obrigatoria' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'senha_curta' };
  }
  return { valid: true };
}

export function validateName(name: string): ValidationResult {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'nome_obrigatorio' };
  }
  return { valid: true };
}

export function validatePasswordConfirmation(
  password: string,
  confirmPassword: string,
): ValidationResult {
  if (password !== confirmPassword) {
    return { valid: false, error: 'senhas_diferentes' };
  }
  return { valid: true };
}

export interface SignUpForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function validateSignUpForm(form: SignUpForm): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  const nameResult = validateName(form.name);
  if (!nameResult.valid && nameResult.error) errors.name = nameResult.error;

  const emailResult = validateEmail(form.email);
  if (!emailResult.valid && emailResult.error) errors.email = emailResult.error;

  const passwordResult = validatePassword(form.password);
  if (!passwordResult.valid && passwordResult.error) errors.password = passwordResult.error;

  if (!errors.password) {
    const confirmResult = validatePasswordConfirmation(form.password, form.confirmPassword);
    if (!confirmResult.valid && confirmResult.error) errors.confirmPassword = confirmResult.error;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
