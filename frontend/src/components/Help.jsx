import { useState } from 'react';
import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';

const DOCS_URL = 'https://nordstad.github.io/Planqer/';

const sections = [
  { id: 'getting-started', title: 'Getting started', no: '01' },
  { id: 'choose-tool', title: 'Choose a tool', no: '02' },
  { id: 'tile-layout', title: 'Tile layout', no: '03' },
  { id: 'results', title: 'Read your result', no: '04' },
  { id: 'troubleshooting', title: 'Troubleshooting', no: '05' },
];

const FullDocsLink = () => (
  <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="btn">
    Read the full documentation
  </a>
);

const HelpPage = () => {
  const [activeSection, setActiveSection] = useState('getting-started');

  return (
    <CatalogPage>
    <div className="grid gap-x-9 gap-y-6 lg:grid-cols-[210px_minmax(0,1fr)]" style={{ marginTop: '18px' }}>
      <div>
        <div className="lg:sticky lg:top-5">
          <div className="section-rule">
            <h2 className="section-title">Contents</h2>
          </div>
          <nav aria-label="Help contents">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="help-entry"
                data-current={activeSection === section.id ? 'true' : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="help-entry-no">{section.no}</span>
                <span className="help-entry-title">{section.title}</span>
              </a>
            ))}
          </nav>
          <p className="synthetic" style={{ marginTop: '14px' }}>
            Quick reference for the four tools
          </p>
          <div style={{ marginTop: '18px' }}>
            <FullDocsLink />
          </div>
        </div>
      </div>

      <div className="help-prose" style={{ minWidth: 0 }}>
        <section id="getting-started" className="help-section">
          <p className="eyebrow">Planqer / Quick reference</p>
          <h1>Start with the material you have</h1>
          <p>
            Planqer works out how many boards, sheets, or tiles to buy and where to cut them.
            Enter dimensions in millimetres, check the result, and take the diagram to your saw.
          </p>
          <div className="help-callout">
            <strong>Three steps</strong>
            <ol>
              <li>Choose the tool that matches your material.</li>
              <li>Enter the required pieces and the stock you can buy.</li>
              <li>Run the plan, then verify the diagram and measurements before cutting.</li>
            </ol>
          </div>
          <p>
            The <strong>Full documentation</strong> link contains installation, configuration,
            API, MCP, backup, and detailed troubleshooting guides.
          </p>
        </section>

        <section id="choose-tool" className="help-section">
          <div className="section-rule">
            <h2 className="section-title">Choose a tool</h2>
          </div>
          <table className="cat-table">
            <thead>
              <tr><th>Tool</th><th>Use it for</th><th>Input</th></tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: 'left' }}><Link to="/cutting">Board cutting</Link></td>
                <td style={{ textAlign: 'left' }}>Boards, lumber, trim, pipe, and other linear stock</td>
                <td>Lengths and quantities</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}><Link to="/sheet-cutting">Sheet cutting</Link></td>
                <td style={{ textAlign: 'left' }}>Plywood, MDF, metal, glass, and acrylic sheets</td>
                <td>Rectangles and quantities</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}><Link to="/tile-layout">Tile layout</Link></td>
                <td style={{ textAlign: 'left' }}>A repeated tile grid on a surface with edges or openings</td>
                <td>Surface, tile, and openings</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}><Link to="/model-cutlist">3D model cutlist</Link></td>
                <td style={{ textAlign: 'left' }}>Parts extracted from an STL, STEP, or STP model</td>
                <td>3D model file</td>
              </tr>
            </tbody>
          </table>
          <p>
            All optimizers account for the saw kerf where applicable. Use the board or sheet
            optimizer when you already know the part dimensions; use the model tool when the CAD
            file is the source of truth.
          </p>
        </section>

        <section id="tile-layout" className="help-section">
          <div className="section-rule">
            <h2 className="section-title">Tile layout essentials</h2>
          </div>
          <p>
            Tile layout chooses a grid position and bond pattern for a rectangular surface. It
            favors usable edge pieces and warns about cuts below the sliver threshold.
          </p>
          <div className="help-grid">
            <div>
              <h3>Surface and tile</h3>
              <p>Enter the surface width and height, then the tile width and height. Values are in millimetres.</p>
            </div>
            <div>
              <h3>Joint and perimeter gap</h3>
              <p>Joint is the gap between tiles. Perimeter gap is clearance between the tile field and the surface edge.</p>
            </div>
            <div>
              <h3>Bond pattern</h3>
              <p>Stack and running use rectangular tiles. Diagonal and herringbone patterns rotate tiles and may create polygonal cut templates.</p>
            </div>
            <div>
              <h3>Openings</h3>
              <p>Add windows, doors, sockets, or other rectangular areas that must remain uncovered.</p>
            </div>
            <div>
              <h3>Candidate layouts</h3>
              <p>Compare the suggested candidates. A slightly less efficient plan may have safer edge cuts or fewer distinct sizes.</p>
            </div>
            <div>
              <h3>Cut templates</h3>
              <p>For diagonal pieces, open the cut template from the cut list. Measurements and instructions are selectable text around the diagram.</p>
            </div>
          </div>
        </section>

        <section id="results" className="help-section">
          <div className="section-rule">
            <h2 className="section-title">Read your result</h2>
          </div>
          <table className="cat-table">
            <tbody>
              <tr><td>Cut plan</td><td style={{ textAlign: 'left' }}>The diagram shows the stock, parts, waste, and cut order.</td></tr>
              <tr><td>Kerf</td><td style={{ textAlign: 'left' }}>Material removed by the blade at each cut.</td></tr>
              <tr><td>Offcut</td><td style={{ textAlign: 'left' }}>Material left after the required pieces and kerf are removed.</td></tr>
              <tr><td>Efficiency</td><td style={{ textAlign: 'left' }}>The share of the available material used by required pieces.</td></tr>
              <tr><td>Cost</td><td style={{ textAlign: 'left' }}>Optional material pricing, available where the optimizer supports it.</td></tr>
            </tbody>
          </table>
          <div className="help-callout help-callout-warning">
            <strong>Before you cut</strong>
            <p>Check units, stock dimensions, kerf, grain or orientation constraints, and every critical measurement. Follow safe operating procedures for your equipment.</p>
          </div>
          <p>
            You can save plans to this Planqer instance when signed in. On a fresh instance, the
            first account created becomes the administrator.
          </p>
        </section>

        <section id="troubleshooting" className="help-section">
          <div className="section-rule">
            <h2 className="section-title">Troubleshooting</h2>
          </div>
          <div className="help-faq">
            <div><h3>Parts do not fit</h3><p>Check that all dimensions use millimetres and add stock sizes large enough for the required parts.</p></div>
            <div><h3>Waste is higher than expected</h3><p>Add realistic stock options, verify kerf, and compare the alternative candidates. For sheet layouts, allow rotation when the material permits it.</p></div>
            <div><h3>A model upload fails</h3><p>Check the file extension and size, then re-export the STL or STEP file from your CAD software if needed.</p></div>
            <div><h3>A project does not save</h3><p>Sign in to the correct local instance. Saved projects require an account; browser-only work may be lost if local storage is cleared.</p></div>
          </div>
          <p>
            For installation issues, server configuration, API errors, or detailed file-processing
            help, use the full documentation or the project issue tracker.
          </p>
          <FullDocsLink />
        </section>
      </div>
    </div>
    </CatalogPage>
  );
};

export default HelpPage;
