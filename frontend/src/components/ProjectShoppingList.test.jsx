import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '../contexts/LanguageContext';
import ProjectShoppingList from './ProjectShoppingList';

const renderList = (projects) => render(
  <LanguageProvider>
    <ProjectShoppingList projects={projects} />
  </LanguageProvider>,
);

it('combines matching stock across plans', () => {
  renderList([
    {
      name: 'First cut',
      parts_data: { 100: 1 },
      optimization_result: { board_lengths_used: [300] },
      material_type: 'oak',
      board_thickness: 45,
      board_width: 45,
    },
    {
      name: 'Second cut',
      parts_data: { 100: 1 },
      optimization_result: { board_lengths_used: [300, 300] },
      material_type: 'oak',
      board_thickness: 45,
      board_width: 45,
    },
  ]);

  expect(screen.getByTestId('project-shopping-list')).toBeInTheDocument();
  expect(screen.getByText('Oak')).toBeInTheDocument();
  expect(screen.getByText('3', { selector: 'td' })).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(2);
});

it('renders nothing when plans have no purchasable material', () => {
  renderList([{ name: 'Empty plan' }]);

  expect(screen.getByTestId('project-shopping-list')).toBeInTheDocument();
  expect(screen.getByText('There is nothing to buy for this project yet.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
