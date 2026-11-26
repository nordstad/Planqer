import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import BoardPlanPage from './BoardPlanPage';
import SheetPlanPage from './SheetPlanPage';
import TilePlanPage from './TilePlanPage';
import WallpaperPlanPage from './WallpaperPlanPage';
import { getProject, getSheetProject, getTileProject, getWallpaperProject } from '../utils/api';
import { printBoardPlan } from '../utils/boardPlanPrint';
import { printSheetPlan } from '../utils/sheetPlanPrint';
import { printTilePlan } from '../utils/tilePlanPrint';
import { printWallpaperPlan } from '../utils/wallpaperPlanPrint';

vi.mock('../utils/api', () => ({
  getProject: vi.fn(), getSheetProject: vi.fn(), getTileProject: vi.fn(), getWallpaperProject: vi.fn(),
}));
vi.mock('./CatalogPage', () => ({ default: ({ children }) => children }));
vi.mock('./BoardPlanDocument', () => ({ default: ({ project }) => <p>Document {project.name}</p> }));
vi.mock('./SheetPlanDocument', () => ({ default: ({ project }) => <p>Document {project.name}</p> }));
vi.mock('./TilePlanDocument', () => ({ default: ({ project }) => <p>Document {project.name}</p> }));
vi.mock('./WallpaperPlanDocument', () => ({ default: ({ plan }) => <p>Document {plan.name}</p> }));
vi.mock('../utils/boardPlanPrint', () => ({ printBoardPlan: vi.fn() }));
vi.mock('../utils/sheetPlanPrint', () => ({ printSheetPlan: vi.fn() }));
vi.mock('../utils/tilePlanPrint', () => ({ printTilePlan: vi.fn() }));
vi.mock('../utils/wallpaperPlanPrint', () => ({ printWallpaperPlan: vi.fn() }));

const cases = [
  { name: 'board', path: '/cutting', Page: BoardPlanPage, load: getProject, print: printBoardPlan, result: 'optimization_result' },
  { name: 'sheet', path: '/sheet-cutting', Page: SheetPlanPage, load: getSheetProject, print: printSheetPlan, result: 'optimization_result' },
  { name: 'tile', path: '/tile-layout', Page: TilePlanPage, load: getTileProject, print: printTilePlan, result: 'layout_result' },
  { name: 'wallpaper', path: '/wallpaper', Page: WallpaperPlanPage, load: getWallpaperProject, print: printWallpaperPlan, result: 'plan_result' },
];
const project = (config, id) => ({
  id, name: `Plan ${id}`, project_group_id: 'synthetic-group',
  [config.result]: { name: `Plan ${id}` },
  room_data: { walls: [], corners: [], closed: false }, wallpaper_data: {},
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const Navigation = ({ path }) => {
  const navigate = useNavigate();
  const location = useLocation();
  return <>
    <button onClick={() => navigate(`${path}/plan/A`)}>Route A</button>
    <button onClick={() => navigate(`${path}/plan/B`)}>Route B</button>
    <output aria-label="Location">{location.pathname}{location.search}</output>
  </>;
};
const setup = (config) => {
  const requests = [];
  config.load.mockImplementation((id) => {
    const request = { ...deferred(), id };
    requests.push(request);
    return request.promise;
  });
  const { Page, path } = config;
  const view = render(<MemoryRouter initialEntries={[`${path}/plan/A`]}>
    <Navigation path={path} />
    <Routes>
      <Route path={`${path}/plan/:planId`} element={<Page />} />
      <Route path={path} element={<p>Editor</p>} />
    </Routes>
  </MemoryRouter>);
  return { ...view, requests, user: userEvent.setup() };
};
const finish = async (request, config, { failure = false, status = 404, id = request.id } = {}) => {
  await act(async () => {
    if (failure) request.reject(Object.assign(new Error('Synthetic failure'), { status }));
    else request.resolve(project(config, id));
  });
};
const expectLoading = () => {
  expect(screen.getByText('Loading preview…')).toBeInTheDocument();
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(screen.queryByText(/^Document /)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Modify' })).not.toBeInTheDocument();
  expect(screen.queryByText('This plan no longer exists.')).not.toBeInTheDocument();
};
const expectCurrent = (id) => {
  expect(screen.getByRole('heading', { name: `Plan ${id}` })).toBeInTheDocument();
  expect(screen.getByText(`Document Plan ${id}`)).toBeInTheDocument();
  expect(screen.queryByText('This plan no longer exists.')).not.toBeInTheDocument();
};

beforeEach(() => vi.clearAllMocks());

describe.each(cases)('$name saved route identity', (config) => {
  it.each([401, 403, 500, null])('does not claim deletion after status %s and retries in place', async (status) => {
    const { requests, user } = setup(config);
    await finish(requests[0], config, { failure: true, status });
    expect(screen.getByRole('alert')).toHaveTextContent(
      status === 401 || status === 403 ? /could not be accessed/ : /may still be saved/,
    );
    expect(screen.queryByText('This plan no longer exists.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modify' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expectLoading();
    await finish(requests[1], config);
    expectCurrent('A');
  });
  it('retires the completed document and actions while another route loads', async () => {
    const { requests, user } = setup(config);
    await finish(requests[0], config);
    expectCurrent('A');
    await user.click(screen.getByRole('button', { name: 'Route B' }));
    expectLoading();
    await finish(requests[1], config);
    expectCurrent('B');
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(config.print).toHaveBeenCalledTimes(1);
    expect(config.print.mock.calls[0][0].name).toBe('Plan B');
    await user.click(screen.getByRole('button', { name: 'Modify' }));
    expect(screen.getByLabelText('Location')).toHaveTextContent(`${config.path}?edit=B`);
  });

  for (const order of ['old-first', 'new-first']) {
    for (const failure of [false, true]) {
      it(`ignores obsolete ${failure ? 'failure' : 'success'} (${order})`, async () => {
        const { requests, user } = setup(config);
        await user.click(screen.getByRole('button', { name: 'Route B' }));
        if (order === 'old-first') {
          await finish(requests[0], config, { failure });
          expectLoading();
          await finish(requests[1], config);
        } else {
          await finish(requests[1], config);
          expectCurrent('B');
          await finish(requests[0], config, { failure });
        }
        expectCurrent('B');
      });
    }
  }

  for (const failure of [false, true]) {
    it(`keeps A current when B finishes late with ${failure ? 'failure' : 'success'} after A→B→A`, async () => {
      const { requests, user } = setup(config);
      await finish(requests[0], config);
      await user.click(screen.getByRole('button', { name: 'Route B' }));
      await user.click(screen.getByRole('button', { name: 'Route A' }));
      expectLoading();
      expect(requests.map(({ id }) => id)).toEqual(['A', 'B', 'A']);
      await finish(requests[2], config);
      await finish(requests[1], config, { failure });
      expectCurrent('A');
      await user.click(screen.getByRole('button', { name: 'Print' }));
      expect(config.print.mock.calls[0][0].name).toBe('Plan A');
      await user.click(screen.getByRole('button', { name: 'Modify' }));
      expect(screen.getByLabelText('Location')).toHaveTextContent(`${config.path}?edit=A`);
    });
  }

  it('does not reuse an earlier request for the same ID after A→B→A', async () => {
    const { requests, user } = setup(config);
    await user.click(screen.getByRole('button', { name: 'Route B' }));
    await user.click(screen.getByRole('button', { name: 'Route A' }));
    await finish(requests[0], config);
    expectLoading();
    await finish(requests[2], config);
    expectCurrent('A');
  });

  it('clears a missing state on navigation and recovers normally', async () => {
    const { requests, user } = setup(config);
    await finish(requests[0], config, { failure: true });
    expect(screen.getByText('This plan no longer exists.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Route B' }));
    expectLoading();
    await finish(requests[1], config);
    expectCurrent('B');
  });

  it('preserves a current failure when an obsolete success arrives', async () => {
    const { requests, user } = setup(config);
    await user.click(screen.getByRole('button', { name: 'Route B' }));
    await finish(requests[1], config, { failure: true });
    await finish(requests[0], config);
    expect(screen.getByText('This plan no longer exists.')).toBeInTheDocument();
    expect(screen.queryByText(/^Document /)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modify' })).not.toBeInTheDocument();
  });

  it('offers Modify but not Print for a current uncalculated plan', async () => {
    const { requests, user } = setup(config);
    await act(async () => requests[0].resolve({ ...project(config, 'A'), [config.result]: null }));
    expect(screen.getByText('This plan has no calculated result yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modify' }));
    expect(screen.getByLabelText('Location')).toHaveTextContent(`${config.path}?edit=A`);
  });
});
