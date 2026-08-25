/*
  Everything about money, in one place. Most people plan cuts without ever
  pricing their stock, so this whole panel is folded away — and when it is open,
  the prices you type and the breakdown they produce sit together rather than the
  answer landing somewhere else on the page.

  Prices are an input, so applying them re-runs the plan. Two things follow, and
  both used to be missing. The figures on screen belong to the prices that
  produced them, so the panel says so when you have edited past them rather than
  showing a breakdown for prices you have already changed. And a re-run is a
  comparison, not a fresh answer: it states what moved — total, boards, offcut —
  because "least money" buys its saving with offcut, and that trade is the whole
  reason to look at this panel twice.
*/

import { useEffect, useRef } from 'react';
import Loader from './Loader';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

/* Money keeps the plain dot-decimal of the price fields directly above it rather
   than a grouped locale form, so a figure you type and a figure you read back
   are written the same way. */
const money = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—');

const delta = (before, after, format) => {
  const d = Number(after) - Number(before);
  if (!Number.isFinite(d) || Math.abs(d) < 0.005) return 'unchanged';
  return `${d < 0 ? '−' : '+'}${format(Math.abs(d))}`;
};

const CostAnalysisPanel = ({
  currency, validBoards, boardCosts, setBoardCosts,
  samePriceForAll, setSamePriceForAll, uniformPrice, setUniformPrice,
  optimizeFor, setOptimizeFor, costTouched, setCostTouched, costSubmitAttempted,
  onApply, applying, appliedCost, pricesDirty, previous, boardsUsed, offcut,
}) => {
  /* cost_per_board_type is the LINE total for a stock length, not a unit price,
     and the API keys it by str(float) — "5100.0" — while the plan's own counts
     come from JSON numbers and key as "5100". Matching those keys literally is
     what printed 0.00 on every line beside a non-zero total, so compare the
     numbers rather than the strings. */
  const lineTotalFor = (boardLength) => {
    const hit = Object.entries(appliedCost?.costPerBoardType || {})
      .find(([key]) => parseFloat(key) === parseFloat(boardLength));
    return hit ? hit[1] : 0;
  };

  const priceEveryBoard = (pricePerMeter) => {
    const next = {};
    validBoards.forEach((board) => {
      const boardLength = parseFloat(board);
      next[boardLength] = {
        price_per_meter: pricePerMeter,
        price_per_board: pricePerMeter * (boardLength / 1000),
      };
    });
    setBoardCosts(next);
  };

  /* Applying prices re-runs the solver, and the result renders below this
     button. On a short viewport — or a long list of stock lengths — that lands
     just off the bottom edge, which reads as nothing having happened. Nudge the
     minimum distance to bring it into view, and only on the run finishing, so
     the page never moves under someone who is still typing. */
  const resultRef = useRef(null);
  const wasApplying = useRef(false);
  useEffect(() => {
    if (wasApplying.current && !applying) {
      resultRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
    wasApplying.current = applying;
  }, [applying]);

  const totalBoardsBought = Object.values(appliedCost?.byType || {})
    .reduce((sum, quantity) => sum + quantity, 0);

  /* cost_per_useful_material comes back per millimetre, which at four decimals
     is a number nobody can compare against anything. Same figure, per metre. */
  const perMetreOfParts = Number.isFinite(Number(appliedCost?.costPerUseful))
    ? Number(appliedCost.costPerUseful) * 1000
    : null;

  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: '8px', gap: '12px', flexWrap: 'wrap' }}>
        <span className="kicker">Price per metre · {currency}</span>
        <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={samePriceForAll}
            onChange={(e) => {
              setSamePriceForAll(e.target.checked);
              if (e.target.checked && uniformPrice) priceEveryBoard(parseFloat(uniformPrice) || 0);
            }}
          />
          <span className="kicker" style={{ color: 'var(--ink)' }}>One price for all lengths</span>
        </label>
      </div>

      {samePriceForAll ? (
        <table className="cat-table">
          <thead><tr><th>All stock</th><th>{currency} / m</th><th>Applies to</th></tr></thead>
          <tbody>
            <tr>
              <td>Uniform</td>
              <td>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="35.0"
                  value={uniformPrice}
                  onChange={(e) => {
                    setUniformPrice(e.target.value);
                    if (e.target.value) priceEveryBoard(parseFloat(e.target.value) || 0);
                  }}
                  onBlur={() => setCostTouched((prev) => ({ ...prev, uniform: true }))}
                  className={`cell-input ${(costTouched.uniform || costSubmitAttempted) && (!uniformPrice || parseFloat(uniformPrice) <= 0) ? 'is-error' : ''}`}
                  aria-label={`Uniform price per metre in ${currency}`}
                />
              </td>
              <td style={{ color: 'var(--ink-3)' }}>
                {validBoards.length} {validBoards.length === 1 ? 'length' : 'lengths'}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="cat-table">
          <thead><tr><th>Stock</th><th>Length mm</th><th>{currency} / m</th><th>Per board</th></tr></thead>
          <tbody>
            {validBoards.map((board) => {
              const boardLength = parseFloat(board);
              const costData = boardCosts[boardLength] || {};
              const perBoard = (costData.price_per_meter || 0) * (boardLength / 1000);
              const priceMissing = (costTouched[boardLength] || costSubmitAttempted)
                && (!costData.price_per_meter || costData.price_per_meter <= 0);
              return (
                <tr key={boardLength}>
                  <td>SPF-{Math.round(boardLength / 100)}</td>
                  <td>{mm(boardLength)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0.0"
                      value={costData.price_per_meter || ''}
                      onChange={(e) => {
                        const pricePerMeter = parseFloat(e.target.value) || 0;
                        setBoardCosts((prev) => ({
                          ...prev,
                          [boardLength]: {
                            price_per_meter: pricePerMeter,
                            price_per_board: pricePerMeter * (boardLength / 1000),
                          },
                        }));
                      }}
                      onBlur={() => setCostTouched((prev) => ({ ...prev, [boardLength]: true }))}
                      className={`cell-input ${priceMissing ? 'is-error' : ''}`}
                      aria-label={`Price per metre for the ${boardLength} mm length`}
                    />
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>
                    {perBoard > 0 ? `${money(perBoard)} ${currency}` : '—'}
                  </td>
                </tr>
              );
            })}
            {validBoards.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'left', color: 'var(--ink-3)' }}>
                Add stock lengths on the parts step to price them
              </td></tr>
            )}
          </tbody>
        </table>
      )}

      <fieldset style={{ marginTop: '20px', border: 0, padding: 0, minWidth: 0 }}>
        <legend className="kicker" style={{ padding: 0 }}>What should the plan chase?</legend>
        <div style={{ marginTop: '8px' }}>
          <label className="flex items-start gap-3" style={{ cursor: 'pointer', padding: '5px 0' }}>
            <input
              type="radio"
              name="optimizeFor"
              value="waste"
              checked={optimizeFor === 'waste'}
              onChange={(e) => setOptimizeFor(e.target.value)}
              style={{ marginTop: '3px' }}
            />
            <span>
              <b style={{ fontSize: '13.5px' }}>Least waste</b>
              <span className="block synthetic">Fewest millimetres thrown away</span>
            </span>
          </label>
          <label className="flex items-start gap-3" style={{ cursor: 'pointer', padding: '5px 0' }}>
            <input
              type="radio"
              name="optimizeFor"
              value="cost"
              checked={optimizeFor === 'cost'}
              onChange={(e) => setOptimizeFor(e.target.value)}
              style={{ marginTop: '3px' }}
            />
            <span>
              <b style={{ fontSize: '13.5px' }}>Least money</b>
              <span className="block synthetic">Cheaper stock even if it leaves more offcut</span>
            </span>
          </label>
        </div>
      </fieldset>

      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: '18px' }}
        onClick={onApply}
        disabled={applying}
      >
        {applying
          ? <><Loader /> Pricing the plan</>
          : !appliedCost
            ? 'Price this plan'
            : pricesDirty
              ? 'Apply the changed prices'
              : 'Price this plan again'}
      </button>

      {/* The prices on screen are not the prices in the plan on screen. Said
          here, next to the button that reconciles them, and repeated on the
          folded line above so it is legible with this panel shut. */}
      {pricesDirty && !applying && (
        <p className="alert-note" style={{ marginTop: '14px' }} role="status">
          You have changed prices since this plan was costed. Everything below is
          the <b>previous</b> set — apply the changes to re-cost it.
        </p>
      )}

      {appliedCost ? (
        <div ref={resultRef} style={{ marginTop: '26px', scrollMarginBottom: '16px' }}>
          <div className="section-rule">
            <h3 className="section-title">What this plan costs</h3>
            <span className="folio">All figures in {appliedCost.currency}</span>
          </div>

          <p className="synthetic" style={{ marginTop: '10px', marginBottom: '14px' }}>
            Your own prices applied to the stock this plan actually buys — Planqer
            quotes no supplier. The total also sits with the plan's other figures
            at the top of this step.
          </p>

          <dl className="plan-facts">
            <div className="plan-fact">
              <dt>Total</dt>
              <dd>{money(appliedCost.totalCost)} {appliedCost.currency}</dd>
            </div>
            <div className="plan-fact">
              <dt>In the offcut</dt>
              <dd>{money(appliedCost.wasteCost)} {appliedCost.currency}</dd>
            </div>
            {perMetreOfParts !== null && (
              <div className="plan-fact">
                <dt>Per metre of parts</dt>
                <dd>{money(perMetreOfParts)} {appliedCost.currency}</dd>
              </div>
            )}
            <div className="plan-fact">
              <dt>Chasing</dt>
              <dd>{optimizeFor === 'cost' ? 'Least money' : 'Least waste'}</dd>
            </div>
          </dl>

          <p className="synthetic" style={{ marginTop: '10px' }}>
            In the offcut is the share of the total you pay for and never cut.
            Per metre of parts spreads the total over the length you keep.
          </p>

          {/* A second run is a comparison. Which is the point: chasing money
              can buy a cheaper total with more offcut, and that trade is
              invisible if the old numbers are simply overwritten. */}
          {previous && (
            <div style={{ marginTop: '22px' }}>
              <span className="kicker">What changed since the last run</span>
              <table className="cat-table" style={{ marginTop: '6px' }}>
                <thead><tr><th>Figure</th><th>Before</th><th>Now</th><th>Change</th></tr></thead>
                <tbody>
                  <tr>
                    <td>Total {appliedCost.currency}</td>
                    <td>{money(previous.totalCost)}</td>
                    <td>{money(appliedCost.totalCost)}</td>
                    <td>{delta(previous.totalCost, appliedCost.totalCost, money)}</td>
                  </tr>
                  <tr>
                    <td>Boards</td>
                    <td>{previous.boardsUsed}</td>
                    <td>{boardsUsed}</td>
                    <td>{delta(previous.boardsUsed, boardsUsed, (n) => mm(n))}</td>
                  </tr>
                  <tr>
                    <td>Offcut mm</td>
                    <td>{mm(previous.offcut)}</td>
                    <td>{mm(offcut)}</td>
                    <td>{delta(previous.offcut, offcut, (n) => mm(n))}</td>
                  </tr>
                </tbody>
              </table>
              <p className="synthetic" style={{ marginTop: '8px' }}>
                A change in boards or offcut means the cut diagram above was
                redrawn too.
              </p>
            </div>
          )}

          <div style={{ marginTop: '22px' }}>
            <span className="kicker">What you buy</span>
            <table className="cat-table" style={{ marginTop: '6px' }}>
              <thead><tr><th>Stock</th><th>Boards</th><th>Per board</th><th>Cost</th></tr></thead>
              <tbody>
                {Object.entries(appliedCost.byType).map(([boardLength, quantity]) => {
                  const lineTotal = lineTotalFor(boardLength);
                  return (
                    <tr key={boardLength}>
                      <td>SPF-{Math.round(parseFloat(boardLength) / 100)}</td>
                      <td>{quantity}</td>
                      <td>{quantity ? money(lineTotal / quantity) : '—'}</td>
                      <td>{money(lineTotal)}</td>
                    </tr>
                  );
                })}
                <tr className="is-sum">
                  <td>Σ</td>
                  <td>{totalBoardsBought}</td>
                  <td />
                  <td>{money(appliedCost.totalCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="synthetic" style={{ marginTop: '12px' }}>
          The plan on screen has no prices in it yet. Price it and the cost
          appears here, and beside the plan's other figures at the top of this
          step.
        </p>
      )}
    </>
  );
};

export default CostAnalysisPanel;
