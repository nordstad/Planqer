import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, useLocation } from 'react-router-dom';
import { LanguageProvider } from '../contexts/LanguageContext';
import i18n from '../i18n';
import CatalogPage from './CatalogPage';
import PlanSteps from './PlanSteps';
import PlanMoreMenu from './PlanMoreMenu';
import MovePlanMenu from './MovePlanMenu';
import SheetPartRow from './SheetPartRow';
import { focusDestination } from '../utils/focusDestination';
import FormField from './FormField';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'synthetic' }, singleUser: true }),
}));

it('owns one main, skips navigation, and does not steal focus for query consumption', async () => {
  const user = userEvent.setup();
  const Page = () => {
    const { pathname } = useLocation();
    return <CatalogPage><h1>{pathname}</h1><Link to="/help">Help route</Link><Link to="/cutting?edit=1">Edit query</Link></CatalogPage>;
  };
  render(<MemoryRouter initialEntries={['/cutting']}><LanguageProvider><Page /></LanguageProvider></MemoryRouter>);
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  expect(document.title).toBe('Board cutting — Partsible');
  const scroll = vi.fn();
  const scrollPage = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  screen.getByRole('heading', { level: 1 }).scrollIntoView = scroll;
  await user.click(screen.getByText('Edit query'));
  expect(screen.getByText('Edit query')).toHaveFocus();
  await user.click(screen.getByText('Help route'));
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  expect(document.title).toBe('Help — Partsible');
  expect(scroll).not.toHaveBeenCalled();
  expect(scrollPage).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
  await user.click(screen.getByText('Skip to main content'));
  expect(screen.getByRole('main')).toHaveFocus();
  scrollPage.mockRestore();
});

it('updates shell titles for locale and explicit loading/document identity', async () => {
  const Page = ({ title }) => <MemoryRouter initialEntries={['/help']}><LanguageProvider><CatalogPage title={title}><h1>Heading</h1></CatalogPage></LanguageProvider></MemoryRouter>;
  const { rerender } = render(<Page />);
  await i18n.changeLanguage('sv-SE');
  expect(document.title).toBe(`${i18n.t('common.help')} — Partsible`);
  rerender(<Page title="Synthetic plan" />);
  expect(document.title).toBe('Synthetic plan — Partsible');
  rerender(<Page title={i18n.t('ui.loadingPreview')} />);
  expect(document.title).not.toContain('Synthetic plan');
  await i18n.changeLanguage('en-GB');
});

it('focuses genuine step changes, but not same-step updates', () => {
  const steps = [{ label: 'Parts', reachable: true }, { label: 'Plan', reachable: true }];
  const View = ({ current, summary }) => <div><PlanSteps steps={steps} current={current} onSelect={() => {}} /><section className="step-view"><h1>{summary}</h1><input aria-label="Price" /></section></div>;
  const { rerender } = render(<View current={0} summary="Parts" />);
  rerender(<View current={1} summary="Plan" />);
  expect(screen.getByRole('heading')).toHaveFocus();
  screen.getByLabelText('Price').focus();
  rerender(<View current={1} summary="Repriced plan" />);
  expect(screen.getByLabelText('Price')).toHaveFocus();
});

it('respects reduced motion when revealing a destination', () => {
  const heading = document.createElement('h1');
  heading.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  focusDestination(heading);
  expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  vi.unstubAllGlobals();
});

it('uses nested disclosures with ordinary Tab buttons and nearest Escape recovery', async () => {
  const user = userEvent.setup();
  const move = vi.fn();
  render(<><PlanMoreMenu><button>Modify</button><MovePlanMenu groups={[{ id: 'new', name: 'Destination' }]} onMove={move} /></PlanMoreMenu><button>Outside</button></>);
  const more = screen.getByRole('button', { name: 'More actions' });
  await user.click(more);
  expect(more).toHaveFocus();
  await user.tab();
  expect(screen.getByText('Modify')).toHaveFocus();
  await user.tab();
  const trigger = screen.getByRole('button', { name: 'Move to…' });
  await user.keyboard('{Enter}');
  await user.tab();
  expect(screen.getByText('Destination')).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  expect(more).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{Escape}');
  expect(more).toHaveFocus();
  expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(move).not.toHaveBeenCalled();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it.each(['en-GB', 'sv-SE', 'nb-NO'])('names sheet part dimensions distinctly with row identity: %s', async (language) => {
  await i18n.changeLanguage(language);
  render(<table><tbody><SheetPartRow part={{ id: 'synthetic', width: 100, height: 200, quantity: 1 }} index={2} /></tbody></table>);
  expect(screen.getByRole('spinbutton', { name: i18n.t('accessibilityUi.partWidth', { item: 3 }) })).toHaveValue(100);
  expect(screen.getByRole('spinbutton', { name: i18n.t('accessibilityUi.partHeight', { item: 3 }) })).toHaveValue(200);
  await i18n.changeLanguage('en-GB');
});

it('associates a shared explanation only with affected controls and clears it after correction', () => {
  const Fields = ({ invalid }) => <><p id="opening-error">Outside the wall</p>
    <FormField label="Opening width" error={invalid ? 'Outside the wall' : null} errorId="opening-error"><input /></FormField>
    <FormField label="Opening height"><input /></FormField>
  </>;
  const { rerender } = render(<Fields invalid />);
  expect(screen.getByLabelText('Opening width')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Opening width')).toHaveAccessibleDescription('Outside the wall');
  expect(screen.getByLabelText('Opening height')).not.toHaveAttribute('aria-describedby');
  expect(screen.getAllByText('Outside the wall')).toHaveLength(1);
  rerender(<Fields invalid={false} />);
  expect(screen.getByLabelText('Opening width')).not.toHaveAttribute('aria-invalid');
  expect(screen.getByLabelText('Opening width')).not.toHaveAttribute('aria-describedby');
});
