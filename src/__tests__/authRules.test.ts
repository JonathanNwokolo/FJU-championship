import {
  validateEmail,
  validateName,
  validatePassword,
  validatePasswordConfirmation,
  validateSignUpForm,
} from '../utils/authRules';

describe('authRules', () => {
  describe('validateEmail', () => {
    it('rejeita email vazio', () => {
      expect(validateEmail('').valid).toBe(false);
      expect(validateEmail('   ').valid).toBe(false);
    });

    it('rejeita email sem arroba', () => {
      expect(validateEmail('naoeumemail').valid).toBe(false);
    });

    it('rejeita email sem dominio', () => {
      expect(validateEmail('user@').valid).toBe(false);
    });

    it('rejeita email sem usuario', () => {
      expect(validateEmail('@dominio.com').valid).toBe(false);
    });

    it('aceita email valido', () => {
      expect(validateEmail('user@dominio.com').valid).toBe(true);
      expect(validateEmail('nome.sobrenome@empresa.com.br').valid).toBe(true);
    });

    it('retorna codigo de erro correto para email vazio', () => {
      expect(validateEmail('').error).toBe('email_obrigatorio');
    });

    it('retorna codigo de erro correto para email invalido', () => {
      expect(validateEmail('invalido').error).toBe('email_invalido');
    });
  });

  describe('validatePassword', () => {
    it('rejeita senha vazia', () => {
      expect(validatePassword('').valid).toBe(false);
      expect(validatePassword('').error).toBe('senha_obrigatoria');
    });

    it('rejeita senha com menos de 6 caracteres', () => {
      expect(validatePassword('abc').valid).toBe(false);
      expect(validatePassword('12345').valid).toBe(false);
      expect(validatePassword('12345').error).toBe('senha_curta');
    });

    it('aceita senha com exatamente 6 caracteres', () => {
      expect(validatePassword('123456').valid).toBe(true);
    });

    it('aceita senha longa', () => {
      expect(validatePassword('senha_super_segura_123').valid).toBe(true);
    });
  });

  describe('validateName', () => {
    it('rejeita nome vazio', () => {
      expect(validateName('').valid).toBe(false);
      expect(validateName('   ').valid).toBe(false);
      expect(validateName('').error).toBe('nome_obrigatorio');
    });

    it('aceita nome valido', () => {
      expect(validateName('João Silva').valid).toBe(true);
      expect(validateName('A').valid).toBe(true);
    });
  });

  describe('validatePasswordConfirmation', () => {
    it('rejeita confirmacao diferente', () => {
      expect(validatePasswordConfirmation('abc123', 'abc124').valid).toBe(false);
      expect(validatePasswordConfirmation('abc123', 'abc124').error).toBe('senhas_diferentes');
    });

    it('aceita confirmacao identica', () => {
      expect(validatePasswordConfirmation('abc123', 'abc123').valid).toBe(true);
    });

    it('rejeita confirmacao vazia quando senha nao e vazia', () => {
      expect(validatePasswordConfirmation('abc123', '').valid).toBe(false);
    });

    it('aceita ambos vazios como iguais', () => {
      expect(validatePasswordConfirmation('', '').valid).toBe(true);
    });
  });

  describe('validateSignUpForm', () => {
    const validForm = {
      name: 'João Silva',
      email: 'joao@example.com',
      password: 'senha123',
      confirmPassword: 'senha123',
    };

    it('aprova formulario valido', () => {
      const result = validateSignUpForm(validForm);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('rejeita formulario com nome vazio', () => {
      const result = validateSignUpForm({ ...validForm, name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.name).toBe('nome_obrigatorio');
    });

    it('rejeita formulario com email invalido', () => {
      const result = validateSignUpForm({ ...validForm, email: 'invalido' });
      expect(result.valid).toBe(false);
      expect(result.errors.email).toBe('email_invalido');
    });

    it('rejeita formulario com email vazio', () => {
      const result = validateSignUpForm({ ...validForm, email: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.email).toBe('email_obrigatorio');
    });

    it('rejeita formulario com senha curta', () => {
      const result = validateSignUpForm({ ...validForm, password: '123', confirmPassword: '123' });
      expect(result.valid).toBe(false);
      expect(result.errors.password).toBe('senha_curta');
    });

    it('rejeita formulario com confirmacao de senha diferente', () => {
      const result = validateSignUpForm({ ...validForm, confirmPassword: 'outra_senha' });
      expect(result.valid).toBe(false);
      expect(result.errors.confirmPassword).toBe('senhas_diferentes');
    });

    it('captura multiplos erros ao mesmo tempo', () => {
      const result = validateSignUpForm({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.name).toBeDefined();
      expect(result.errors.email).toBeDefined();
      expect(result.errors.password).toBeDefined();
    });

    it('nao valida confirmacao quando senha ja e invalida', () => {
      const result = validateSignUpForm({
        ...validForm,
        password: '123',
        confirmPassword: 'diferente',
      });
      expect(result.errors.password).toBeDefined();
      expect(result.errors.confirmPassword).toBeUndefined();
    });
  });
});
