import { validNewPassword } from './passwordPolicy';

it.each(['Abc123!x', 'Abcdef!١', `Aa1!${'é'.repeat(34)}`])('accepts a password within the server policy', (value) => {
  expect(validNewPassword(value)).toBe(true);
});
it.each(['Aa1!xxx', 'abcdef1!', 'ABCDEF1!', 'Abcdefg!', 'Abcdef12', `Aa1!${'é'.repeat(35)}`])(
  'rejects a password outside the server policy', (value) => {
    expect(validNewPassword(value)).toBe(false);
  },
);
