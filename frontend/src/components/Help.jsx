import { useState } from 'react';
import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';

const HelpPage = () => {
  const [activeSection, setActiveSection] = useState('getting-started');

  const sections = [
    { id: 'getting-started', title: 'Getting started', no: '01' },
    { id: 'how-to-use', title: 'How to use', no: '02' },
    { id: 'cost-analysis', title: 'Cost analysis', no: '03' },
    { id: 'troubleshooting', title: 'Troubleshooting', no: '04' },
    { id: 'faq', title: 'Questions', no: '05' },
    { id: 'legal', title: 'Licence', no: '06' }
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'getting-started':
        return <GettingStartedSection />;
      case 'how-to-use':
        return <HowToUseSection />;
      case 'cost-analysis':
        return <CostAnalysisSection />;
      case 'troubleshooting':
        return <TroubleshootingSection />;
      case 'faq':
        return <FAQSection />;
      case 'legal':
        return <LegalSection />;
      default:
        return <GettingStartedSection />;
    }
  };

  return (
    <CatalogPage>
      <div className="grid gap-x-9 gap-y-6 lg:grid-cols-[210px_minmax(0,1fr)]" style={{ marginTop: '18px' }}>
        {/* contents rail */}
        <div>
          <div className="lg:sticky lg:top-5">
            <div className="section-rule">
              <h2 className="section-title">Contents</h2>
            </div>
            <nav>
                  {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className="help-entry"
                  aria-current={activeSection === section.id ? 'true' : undefined}
                  data-current={activeSection === section.id ? 'true' : undefined}
                >
                  <span className="help-entry-no">{section.no}</span>
                  <span className="help-entry-title">{section.title}</span>
                </button>
                  ))}
            </nav>
            <p className="synthetic" style={{ marginTop: '14px' }}>Reference for all four tools
            </p>
          </div>
        </div>

        {/* the entry itself */}
        <div className="help-prose" style={{ minWidth: 0 }}>
          {renderSection()}
        </div>
      </div>
    </CatalogPage>
  );
};

// Section Components
const GettingStartedSection = () => (
  <div>
    <h1>Getting started</h1>
    <p>
      Planqer turns a list of parts — or a model you already designed — into a cutting plan:
      how many boards or sheets to buy, and where every cut goes. It subtracts the material the
      saw blade removes at each cut, and it runs on your own machine.
    </p>

    <h2>Choose by what you are cutting</h2>
    <table className="cat-table">
      <thead>
        <tr><th>Optimizer</th><th>For</th><th>Takes</th></tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ textAlign: 'left' }}><Link to="/cutting">Wood Cutting Optimizer</Link></td>
          <td style={{ textAlign: 'left' }}>Boards, lumber, trim, pipe — anything cut to length</td>
          <td>Typed part list</td>
        </tr>
        <tr>
          <td style={{ textAlign: 'left' }}><Link to="/sheet-cutting">Sheet Material Optimizer</Link></td>
          <td style={{ textAlign: 'left' }}>Plywood, MDF, metal, glass and acrylic panels</td>
          <td>Typed part list</td>
        </tr>
        <tr>
          <td style={{ textAlign: 'left' }}><Link to="/model-cutlist">3D Model to Cutlist</Link></td>
          <td style={{ textAlign: 'left' }}>Splits a model into parts and measures each one — STEP also keeps your part names, materials and assembly</td>
          <td>STL, STEP or STP file</td>
        </tr>
      </tbody>
    </table>

    <h2>What every optimizer gives you</h2>
    <table className="cat-table">
      <tbody>
        <tr><td>Cut plan</td><td style={{ textAlign: 'left' }}>A diagram drawn to one scale, each cut in the order you make it</td></tr>
        <tr><td>Kerf</td><td style={{ textAlign: 'left' }}>Blade width subtracted at every cut, not estimated afterwards</td></tr>
        <tr><td>Offcut</td><td style={{ textAlign: 'left' }}>What is left once the parts and the blade have taken theirs</td></tr>
        <tr><td>Cost</td><td style={{ textAlign: 'left' }}>Optional: price per metre per stock length, totalled for the plan</td></tr>
        <tr><td>Projects</td><td style={{ textAlign: 'left' }}>Saved in this browser only, never uploaded</td></tr>
        <tr><td>Units</td><td style={{ textAlign: 'left' }}>Millimetres throughout. No imperial support</td></tr>
      </tbody>
    </table>

    <h2>The order of work</h2>
    <table className="cat-table">
      <tbody>
        <tr><td>01</td><td style={{ textAlign: 'left' }}>Pick the entry that matches your material</td></tr>
        <tr><td>02</td><td style={{ textAlign: 'left' }}>Enter the parts you need, or upload the model that holds them</td></tr>
        <tr><td>03</td><td style={{ textAlign: 'left' }}>Set the stock lengths your supplier carries, and your blade's kerf</td></tr>
        <tr><td>04</td><td style={{ textAlign: 'left' }}>Run the plan and read the boards-required figure</td></tr>
        <tr><td>05</td><td style={{ textAlign: 'left' }}>Take the diagram to the saw, or save the job for later</td></tr>
      </tbody>
    </table>

    <h2>Where to start</h2>
    <p>
      Board cutting is the plainest: type a few lengths, set your stock, run it. What the other
      three do ends up in the same kind of plan.
    </p>
  </div>
);

const HowToUseSection = () => (
  <div>
    <h1 className="text-3xl font-bold text-[var(--ink-2)] mb-6 flex items-center gap-3">How to Use Planqer
    </h1>
    
    <div className="space-y-8">
      {/* Wood Cutting Optimizer */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-bold text-[var(--ink)] mb-6 flex items-center gap-3">Wood Cutting Optimizer (1D Linear)
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">1</span> Define Your Parts
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)]">Length:</strong> Enter in millimeters (e.g., 1200 for 1.2m)
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)]">Quantity:</strong> How many pieces of each length
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">2</span> Set Available Board Lengths
            </h3>
            <p className="text-[var(--ink-2)] mb-3">Configure the lumber sizes you can buy. The defaults are common metric lengths; replace them with what your supplier stocks.</p>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">3</span> Configure Kerf Width
            </h3>
            <p className="text-[var(--ink-2)]">Set saw blade width (typically 3mm). Affects material loss per cut.</p>
          </div>
        </div>
      </div>

      {/* Sheet Material Optimizer */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-bold text-[var(--ink)] mb-6 flex items-center gap-3">Sheet Material Optimizer (2D Rectangular)
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">1</span> Configure Sheet Dimensions
            </h3>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)]">Width & Height:</strong> Sheet material size (e.g., 1200×2500mm plywood)
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)]">Material Type:</strong> Plywood, MDF, metal, acrylic, etc.
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)]">Kerf Width:</strong> Cutting blade thickness
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">2</span> Define Rectangle Parts
            </h3>
            <p className="text-[var(--ink-2)] mb-3">Enter width, height, quantity, and optional part names for each rectangular piece.</p>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">3</span> Advanced Options
            </h3>
            <p className="text-[var(--ink-2)]"><strong>Rotation:</strong> Allow 90° part rotation for better packing efficiency</p>
          </div>
        </div>
      </div>

      {/* 3D Model to Cutlist */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-bold text-[var(--ink)] text-[var(--ink-3)] mb-6 flex items-center gap-3"> 3D Model to Cutlist (STL Analysis)
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">1</span> Upload STL File
            </h3>
            <p className="text-[var(--ink-2)]">Drag & drop or browse for STL files (max 50MB). Works with 3D models from any CAD software.</p>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">2</span> Configure Processing
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Units:</strong> mm, cm, m, inches, or feet
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Precision:</strong> Decimal places for dimensions
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">3</span> Review Classifications
            </h3>
            <p className="text-[var(--ink-2)]">Components are automatically classified as boards (linear) or sheets (rectangular). Export to appropriate optimizer.</p>
          </div>
        </div>
      </div>

      {/* STEP CAD to Cutlist */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-bold text-[var(--ink)] text-[var(--ink-3)] mb-6 flex items-center gap-3">STEP CAD to Cutlist (Metadata Analysis)
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">1</span> Upload STEP Files
            </h3>
            <p className="text-[var(--ink-2)]">Upload .step or .stp CAD files (max 100MB). Preserves component names and material information.</p>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">2</span> Rich Metadata Extraction
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Component Names:</strong> Real part names from CAD
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Materials:</strong> Material properties and types
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-sm font-bold">3</span> Material-Based Grouping
            </h3>
            <p className="text-[var(--ink-2)]">Components grouped by material type and dimensions. Export specific materials to optimizers.</p>
          </div>
        </div>
      </div>

      {/* Universal Features */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-bold text-[var(--ink)] text-[var(--ink-3)] mb-6 flex items-center gap-3">Universal Features (All Optimizers)
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3">Algorithm Selection</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Auto-select:</strong> Recommended for most users
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Fast algorithms:</strong> Bottom-left fill, best fit
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Advanced:</strong> Genetic algorithm for optimal results
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Specialized:</strong> Guillotine cuts for manufacturing
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3">Project Management</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-2">
                <span className="text-[var(--ink)] text-lg"></span>
                <span className="text-[var(--ink-2)]"><strong>Save projects:</strong> Name and store configurations locally</span>
              </div>
              <div className="flex items-center gap-3 p-2">
                <span className="text-[var(--ink)] text-lg"></span>
                <span className="text-[var(--ink-2)]"><strong>Load projects:</strong> Retrieve saved configurations</span>
              </div>
              <div className="flex items-center gap-3 p-2">
                <span className="text-[var(--ink)] text-lg"></span>
                <span className="text-[var(--ink-2)]"><strong>Privacy first:</strong> All data stays on your device</span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-3">Understanding Results</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Visual diagrams:</strong> See exactly how to cut each piece
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Efficiency metrics:</strong> Material usage and waste analysis
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Cost analysis:</strong> Material costs and savings
              </div>
              <div className="p-3 bg-[var(--ground-2)] rounded-lg">
                <strong className="text-[var(--ink)] text-[var(--ink-3)]">Cut lists:</strong> Detailed instructions for each board/sheet
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pro Tips */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-bold text-[var(--ink)] text-[var(--ink-3)] mb-6 flex items-center gap-3">Pro Tips
        </h2>
        
        <div className="space-y-4">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="font-bold text-[var(--ink)] mb-2">Start Simple</h3>
            <p className="text-[var(--ink-2)]">Begin with Wood Cutting Optimizer to learn the basics, then explore 2D and 3D features.</p>
          </div>
          
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="font-bold text-[var(--ink)] mb-2">Variety is Key</h3>
            <p className="text-[var(--ink-2)]">More available material sizes give better optimization results. Include common lengths/sheets.</p>
          </div>
          
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="font-bold text-[var(--ink)] mb-2">Accurate Kerf</h3>
            <p className="text-[var(--ink-2)]">Measure your actual saw blade kerf for more precise calculations and material estimates.</p>
          </div>
          
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="font-bold text-[var(--ink)] mb-2">Use 3D Models</h3>
            <p className="text-[var(--ink-2)]">For complex projects, upload STL or STEP files to automatically extract component dimensions.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const CostAnalysisSection = () => (
  <div>
    <h1 className="text-3xl font-bold text-[var(--ink-2)] mb-6 flex items-center gap-3">Cost Analysis Guide
    </h1>
    <div className="dark:border border-[var(--shop)] rounded-xl p-6 mb-8">
      <p className="text-lg text-[var(--ink-2)] leading-relaxed">Planqer's cost analysis features help you optimize not just for material waste, but also for total project cost. Compare different material options and make informed purchasing decisions.
      </p>
    </div>
    
    <div className="space-y-8">
      {/* Enabling Cost Analysis */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 border-b-2 border-[var(--rule-hair)] pb-2 flex items-center gap-3">Enabling Cost Analysis
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="font-bold text-[var(--ink)] text-[var(--ink-3)] mb-3">Wood Cutting Optimizer</h3>
            <ol className="space-y-2 text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-xs font-bold mt-0.5">1</span>
                <span>Toggle on"Enable Cost Analysis" in the optimization settings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-xs font-bold mt-0.5">2</span>
                <span>Enter the cost per meter for each available board length</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-[var(--ink)] text-[var(--ground)] flex items-center justify-center text-xs font-bold mt-0.5">3</span>
                <span>Run optimization to see cost-efficient results</span>
              </li>
            </ol>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
            <h3 className="font-bold text-[var(--ink)] mb-3">Sheet Material Optimizer</h3>
            <p className="text-[var(--ink-2)] mb-3">Cost analysis automatically calculates material costs based on sheet dimensions and quantity needed.</p>
            <div className="text-sm text-[var(--ink)]">
              <strong>Formula:</strong> Total Cost = (Number of Sheets Required) × (Sheet Width × Sheet Height × Cost per sq mm)
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Strategies */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 border-b-2 border-[var(--rule-hair)] pb-2 flex items-center gap-3">Pricing Strategies
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] mb-3">Per-Unit Pricing</h3>
            <p className="text-[var(--ink-2)] mb-3">Enter the actual cost per unit length (e.g., cost per meter) for each board size.</p>
            <div className="bg-[var(--ground-2)] p-3 rounded-lg text-sm">
              <strong>Example:</strong><br/>2.4m board: $8.50/piece = $3.54/meter<br/>3.6m board: $11.20/piece = $3.11/meter<br/>4.8m board: $14.00/piece = $2.92/meter
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] mb-3">Bulk Pricing</h3>
            <p className="text-[var(--ink-2)] mb-3">Longer boards often have better per-meter pricing due to bulk discounts.</p>
            <div className="bg-[var(--ground-2)] p-3 rounded-lg text-sm">
              <strong>Tip:</strong> Include a variety of board lengths to let the optimizer find the most cost-effective combination, even if you need to buy extra material.
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] mb-3">Including Delivery Costs</h3>
            <p className="text-[var(--ink-2)] mb-3">Factor in delivery fees or transportation costs per board.</p>
            <div className="bg-[var(--ground-2)] p-3 rounded-lg text-sm">
              <strong>Method:</strong> Add delivery cost per board to the base material cost before entering the per-meter price.
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] mb-3">Multi-Supplier Comparison</h3>
            <p className="text-[var(--ink-2)] mb-3">Use different projects to compare pricing from multiple suppliers.</p>
            <div className="bg-[var(--ground-2)] p-3 rounded-lg text-sm">
              <strong>Workflow:</strong> Save separate projects with each supplier's pricing, then compare total costs.
            </div>
          </div>
        </div>
      </div>

      {/* Understanding Cost Results */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 border-b-2 border-[var(--rule-hair)] pb-2 flex items-center gap-3">Understanding Cost Results
        </h2>
        
        <div className="space-y-6">
          <div className="dark:border border-[var(--rule-hair)] rounded-xl p-5">
            <h3 className="text-xl font-semibold text-[var(--ink)] text-[var(--ink-3)] mb-4">Cost Metrics Explained</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
                <h4 className="font-bold text-[var(--ink)] mb-2">Total Material Cost</h4>
                <p className="text-sm text-[var(--ink-2)]">Complete cost of all boards/sheets needed for the project</p>
              </div>
              <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
                <h4 className="font-bold text-[var(--ink)] mb-2">Cost per Part</h4>
                <p className="text-sm text-[var(--ink-2)]">How much each individual part costs to produce</p>
              </div>
              <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
                <h4 className="font-bold text-[var(--ink)] mb-2">Waste Cost</h4>
                <p className="text-sm text-[var(--ink-2)]">Value of material that will be wasted (leftover pieces)</p>
              </div>
              <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4">
                <h4 className="font-bold text-[var(--ink)] mb-2">Cost Efficiency</h4>
                <p className="text-sm text-[var(--ink-2)]">Percentage of material cost that goes into usable parts</p>
              </div>
            </div>
          </div>

          <div className="dark:border border-[var(--shop)] rounded-xl p-5">
            <h3 className="text-xl font-semibold text-[var(--ink)] mb-4">Optimization Strategies</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-[var(--ground-2)] rounded-lg border border-[var(--shop)]">
                <span className="text-[var(--ink)] text-lg"></span>
                <div>
                  <strong className="text-[var(--ink)]">Cost vs. Waste Trade-off</strong>
                  <p className="text-sm text-[var(--ink-2)]">Sometimes using slightly more expensive materials results in lower total project cost due to reduced waste.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-[var(--ground-2)] rounded-lg border border-[var(--shop)]">
                <span className="text-[var(--ink)] text-lg"></span>
                <div>
                  <strong className="text-[var(--ink)]">Length Optimization</strong>
                  <p className="text-sm text-[var(--ink-2)]">The optimizer will select board lengths that minimize both waste and total cost, not just waste.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-[var(--ground-2)] rounded-lg border border-[var(--shop)]">
                <span className="text-[var(--ink)] text-lg"></span>
                <div>
                  <strong className="text-[var(--ink)]">Leftover Value</strong>
                  <p className="text-sm text-[var(--ink-2)]">Consider if leftover pieces can be used in future projects to improve overall cost efficiency.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Practical Examples */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 border-b-2 border-[var(--rule-hair)] pb-2 flex items-center gap-3">Practical Examples
        </h2>
        
        <div className="space-y-6">
          <div className="dark:border border-[var(--rule-hair)] rounded-xl p-5">
            <h3 className="text-xl font-semibold text-[var(--ink)] text-[var(--ink-3)] mb-4">Example: Kitchen Cabinet Project</h3>
            <div className="space-y-4">
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
                <h4 className="font-bold text-[var(--ink)] mb-2">Scenario</h4>
                <p className="text-[var(--ink-2)] text-sm">Need: 12×600mm, 8×450mm, 6×300mm pieces<br/>Available: 2.4m ($15), 3.6m ($20), 4.8m ($24) boards
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
                  <h4 className="font-bold text-[var(--revision)] mb-2">Waste-Only Optimization</h4>
                  <p className="text-sm text-[var(--ink-2)]">Uses 2.4m boards exclusively<br/>Minimal waste but higher per-meter cost</p>
                </div>
                <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
                  <h4 className="font-bold text-[var(--ink)] mb-2">Cost-Aware Optimization</h4>
                  <p className="text-sm text-[var(--ink-2)]">Mix of 3.6m and 4.8m boards<br/>Lower total cost despite some waste</p>
                </div>
              </div>
            </div>
          </div>

          <div className="dark:border border-[var(--signal)] rounded-xl p-5">
            <h3 className="text-xl font-semibold text-[var(--ink)] mb-4">Sheet Material Cost Comparison</h3>
            <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--signal)]">
              <h4 className="font-bold text-[var(--ink)] mb-2">Plywood vs. MDF Analysis</h4>
              <div className="text-sm text-[var(--ink-2)] space-y-1">
                <p><strong>Project:</strong> Multiple rectangular cuts from sheet material</p>
                <p><strong>Plywood:</strong> Higher cost per sheet, but better strength and resale value of leftovers</p>
                <p><strong>MDF:</strong> Lower cost per sheet, but leftover pieces have minimal reuse value</p>
                <p><strong>Result:</strong> Cost analysis helps factor in leftover value, not just initial material cost</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tips for Accurate Cost Analysis */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink)] text-[var(--ink-3)] mb-4 flex items-center gap-3">Tips for Accurate Cost Analysis
        </h2>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
              <h3 className="font-bold text-[var(--ink)] mb-2">Research Current Prices</h3>
              <p className="text-sm text-[var(--ink-2)]">Check multiple suppliers and factor in seasonal price variations</p>
            </div>
            <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
              <h3 className="font-bold text-[var(--ink)] mb-2">Include All Costs</h3>
              <p className="text-sm text-[var(--ink-2)]">Delivery, handling fees, and taxes should be included in material costs</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
              <h3 className="font-bold text-[var(--ink)] mb-2">Consider Leftover Value</h3>
              <p className="text-sm text-[var(--ink-2)]">Some materials retain value for future projects or resale</p>
            </div>
            <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
              <h3 className="font-bold text-[var(--ink)] mb-2">⏱ Update Regularly</h3>
              <p className="text-sm text-[var(--ink-2)]">Material prices change frequently - update your saved projects periodically</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const TroubleshootingSection = () => (
  <div>
    <h1 className="text-3xl font-bold text-[var(--ink-2)] mb-6 flex items-center gap-3">Troubleshooting
    </h1>
    <div className="dark:border border-[var(--signal)] rounded-xl p-6 mb-8">
      <p className="text-lg text-[var(--ink-2)] leading-relaxed">Common issues and solutions to help you get the most out of Planqer. Most problems can be resolved with these quick fixes.
      </p>
    </div>
    
    <div className="space-y-8">
      {/* Input and Validation Issues */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 border-b-2 border-[var(--rule-hair)] pb-2 flex items-center gap-3">Input and Validation Issues
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--revision-bg)] bg-[var(--ground-2)] border-2 border-[var(--revision)] border rounded-lg p-5">
            <h3 className="font-bold text-[var(--revision)] mb-3 flex items-center gap-2">
              <span className="text-[var(--revision)]"></span>"Invalid dimensions" or"Invalid quantity" errors
            </h3>
            <div className="space-y-3">
              <p className="text-[var(--ink-2)]"><strong>Cause:</strong> Non-numeric values, negative numbers, or extremely large values</p>
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--revision)]">
                <h4 className="font-semibold text-[var(--revision)] mb-2">Solutions:</h4>
                <ul className="space-y-1 text-sm text-[var(--ink-2)]">
                  <li>Use only numbers (no letters or special characters)</li>
                  <li>All dimensions must be positive values</li>
                  <li>Keep dimensions reasonable (max 10000mm for most fields)</li>
                  <li>Quantities must be whole numbers (1, 2, 3...)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border-2 border-[var(--signal)] border rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="text-[var(--ink)]"></span> Parts don't fit in available materials
            </h3>
            <div className="space-y-3">
              <p className="text-[var(--ink-2)]"><strong>Cause:</strong> Part dimensions exceed available board/sheet sizes</p>
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--signal)]">
                <h4 className="font-semibold text-[var(--ink)] mb-2">Solutions:</h4>
                <ul className="space-y-1 text-sm text-[var(--ink-2)]">
                  <li>Add larger board lengths or sheet sizes</li>
                  <li>Check if part dimensions are correct (not in wrong units)</li>
                  <li>Consider splitting large parts into smaller pieces</li>
                  <li>For sheets: enable rotation to try different orientations</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File Upload Problems */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 border-b-2 border-[var(--rule-hair)] pb-2 flex items-center gap-3">File Upload Problems
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--revision-bg)] bg-[var(--ground-2)] border-2 border-[var(--revision)] border rounded-lg p-5">
            <h3 className="font-bold text-[var(--revision)] mb-3 flex items-center gap-2">
              <span className="text-[var(--revision)]"></span>"Failed to process STL/STEP file"
            </h3>
            <div className="space-y-3">
              <p className="text-[var(--ink-2)]"><strong>Common causes:</strong> Corrupted files, unsupported format, or file too large</p>
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--revision)]">
                <h4 className="font-semibold text-[var(--revision)] mb-2">Solutions:</h4>
                <ul className="space-y-1 text-sm text-[var(--ink-2)]">
                  <li>Verify file extension (.stl for 3D models, .step/.stp for CAD files)</li>
                  <li>Check file size (STL max 50MB, STEP max 100MB)</li>
                  <li>Try re-exporting from your CAD software</li>
                  <li>Use binary STL format instead of ASCII for smaller files</li>
                  <li>Simplify complex models before export</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border-2 border-[var(--signal)] border rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="text-[var(--ink)]"></span>"No components found" after processing
            </h3>
            <div className="space-y-3">
              <p className="text-[var(--ink-2)]"><strong>Cause:</strong> Model doesn't contain recognizable board or sheet components</p>
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--signal)]">
                <h4 className="font-semibold text-[var(--ink)] mb-2">Solutions:</h4>
                <ul className="space-y-1 text-sm text-[var(--ink-2)]">
                  <li>Check that model contains rectangular/linear components</li>
                  <li>Verify units are correct (model may be too small/large)</li>
                  <li>Try different precision settings</li>
                  <li>For STEP files: ensure components have proper material assignments</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Optimization Issues */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 border-b-2 border-[var(--rule-hair)] pb-2 flex items-center gap-3">Optimization Issues
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] text-[var(--ink-3)] mb-3 flex items-center gap-2">
              <span className="text-[var(--ink)]"></span> Optimization taking too long
            </h3>
            <div className="space-y-3">
              <p className="text-[var(--ink-2)]"><strong>Cause:</strong> Complex projects with many parts or advanced algorithms</p>
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
                <h4 className="font-semibold text-[var(--ink)] text-[var(--ink-3)] mb-2">Solutions:</h4>
                <ul className="space-y-1 text-sm text-[var(--ink-2)]">
                  <li>Try"Auto-select" algorithm first</li>
                  <li>Use"Bottom-Left Fill" for faster results</li>
                  <li>Reduce number of available material sizes</li>
                  <li>Break large projects into smaller batches</li>
                  <li>Avoid"Genetic Algorithm" for simple projects</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] text-[var(--ink-3)] mb-3 flex items-center gap-2">
              <span className="text-[var(--ink)]"></span> Poor optimization results (high waste)
            </h3>
            <div className="space-y-3">
              <p className="text-[var(--ink-2)]"><strong>Cause:</strong> Limited material sizes or suboptimal settings</p>
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
                <h4 className="font-semibold text-[var(--ink)] text-[var(--ink-3)] mb-2">Solutions:</h4>
                <ul className="space-y-1 text-sm text-[var(--ink-2)]">
                  <li>Add more board lengths/sheet sizes to choose from</li>
                  <li>Try different algorithms (Genetic Algorithm for best results)</li>
                  <li>Enable rotation for sheet materials</li>
                  <li>Reduce kerf width if it's set too high</li>
                  <li>Consider combining similar part sizes</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Browser and Performance Issues */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 border-b-2 border-[var(--rule-hair)] pb-2 flex items-center gap-3">Browser and Performance Issues
        </h2>
        
        <div className="space-y-6">
          <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink-2)] mb-3 flex items-center gap-2">
              <span className="text-[var(--ink-2)]"></span> Page won't load or keeps refreshing
            </h3>
            <div className="space-y-3">
              <p className="text-[var(--ink-2)]"><strong>Cause:</strong> Browser cache issues or outdated browser</p>
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
                <h4 className="font-semibold text-[var(--ink-2)] mb-2">Solutions:</h4>
                <ul className="space-y-1 text-sm text-[var(--ink-2)]">
                  <li>Clear browser cache and cookies</li>
                  <li>Try refreshing with Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)</li>
                  <li>Update to latest browser version</li>
                  <li>Try a different browser (Chrome, Firefox, Safari, Edge)</li>
                  <li>Disable browser extensions temporarily</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-[var(--ground-2)] border-2 border-[var(--rule)] border border-[var(--shop)] rounded-lg p-5">
            <h3 className="font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
              <span className="text-[var(--ink)]"></span> Projects not saving or loading
            </h3>
            <div className="space-y-3">
              <p className="text-[var(--ink-2)]"><strong>Cause:</strong> Browser storage restrictions or private browsing mode</p>
              <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--shop)]">
                <h4 className="font-semibold text-[var(--ink)] mb-2">Solutions:</h4>
                <ul className="space-y-1 text-sm text-[var(--ink-2)]">
                  <li>Exit private/incognito browsing mode</li>
                  <li>Allow cookies and local storage for this site</li>
                  <li>Clear old projects to free up storage space</li>
                  <li>Check browser storage settings</li>
                  <li>Export important project data manually</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Getting Additional Help */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink)] text-[var(--ink-3)] mb-4 flex items-center gap-3">Still Need Help?
        </h2>
        
        <div className="space-y-4">
          <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
            <h3 className="font-bold text-[var(--ink)] mb-2">General Troubleshooting Steps</h3>
            <ol className="space-y-1 text-sm text-[var(--ink-2)]">
              <li>1. Refresh the page and try again</li>
              <li>2. Check that all input values are valid</li>
              <li>3. Try with a simpler project first</li>
              <li>4. Clear browser cache if problems persist</li>
              <li>5. Try a different browser</li>
            </ol>
          </div>
          
          <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
            <h3 className="font-bold text-[var(--ink)] mb-2">Reporting Issues</h3>
            <p className="text-sm text-[var(--ink-2)]">If you encounter persistent problems, please report them at our 
              <a href="https://github.com/anthropics/claude-code/issues" target="_blank" rel="noopener noreferrer" className="text-[var(--ink)] hover:underline mx-1">GitHub Issues page
              </a>
              with details about your browser, operating system, and the specific error.
            </p>
          </div>
          
          <div className="bg-[var(--ground-2)] p-4 rounded-lg border border-[var(--rule-hair)]">
            <h3 className="font-bold text-[var(--ink)] mb-2">Best Practices</h3>
            <ul className="space-y-1 text-sm text-[var(--ink-2)]">
              <li>Save important projects regularly</li>
              <li>Use modern browsers for best performance</li>
              <li>Keep file sizes reasonable for faster processing</li>
              <li>Start with simple projects to learn the interface</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const FAQSection = () => (
  <div>
    <h1 className="text-3xl font-bold text-[var(--ink-2)] mb-6 flex items-center gap-3">Frequently Asked Questions
    </h1>
    
    <div className="space-y-8">
      {/* General Questions */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-6 flex items-center gap-3">General Questions
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What is Planqer?</h3>
            <p className="text-[var(--ink-2)]">Planqer plans cuts for linear stock and sheet material, in millimetres, on your own machine</p>
          </div>
          
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Is Planqer free to use?</h3>
            <p className="text-[var(--ink-2)]">Yes, Planqer is completely free and open-source under the MIT license. All features are available at no cost.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Do I need to create an account?</h3>
            <p className="text-[var(--ink-2)]">No. Planqer works fully signed out, with projects saved in your browser. Signing in is optional — it's a local account on this same instance, never a cloud account, and it lets your saved projects follow you across browsers and devices on this instance.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Does Planqer work offline?</h3>
            <p className="text-[var(--ink-2)]">The main optimization features work offline once the page is loaded. However, you need an internet connection to initially load the application and for 3D file processing.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What materials can I optimize with Planqer?</h3>
            <p className="text-[var(--ink-2)]">Planqer works with any material that can be cut linearly (wood, metal pipes, trim) or in sheets (plywood, metal sheets, acrylic, glass, fabric). The algorithms are material-agnostic - you just specify dimensions and cutting parameters.</p>
          </div>
        </div>
      </div>

      {/* Feature Questions */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-6 flex items-center gap-3">Feature Questions
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What's the difference between the 4 optimizers?</h3>
            <div className="text-[var(--ink-2)] space-y-2">
              <p><strong>Wood Cutting Optimizer:</strong> 1D linear cutting for boards, pipes, trim</p>
              <p><strong>Sheet Material Optimizer:</strong> 2D rectangular packing for plywood, metal sheets, glass</p>
              <p><strong>3D Model to Cutlist:</strong> Analyzes STL files to extract component dimensions</p>
              <p><strong>STEP CAD to Cutlist:</strong> Processes STEP files with rich metadata like component names and materials</p>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Can I upload my own 3D models?</h3>
            <p className="text-[var(--ink-2)]">Yes! Upload STL files (up to 50MB) or STEP files (up to 100MB). Planqer will automatically identify board and sheet components and classify them for optimization.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Which algorithm should I choose?</h3>
            <p className="text-[var(--ink-2)]">Use"Auto-select" for most projects - it chooses the best algorithm based on complexity. For speed, try"Bottom-Left Fill". For maximum optimization, use"Genetic Algorithm" (takes longer but gives best results).</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Can I optimize for cost as well as waste?</h3>
            <p className="text-[var(--ink-2)]">Yes! Enable cost analysis in the Wood Cutting Optimizer by entering price per meter for each board length. Planqer will then optimize for both minimal waste and lowest total cost.</p>
          </div>
        </div>
      </div>

      {/* Technical Questions */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-6 flex items-center gap-3">Technical Questions
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">How accurate are the calculations?</h3>
            <p className="text-[var(--ink-2)]">Planqer uses proven optimization algorithms and accounts for saw blade width (kerf), cutting patterns, and material constraints. Results are mathematically optimal within the specified parameters.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What data does Planqer collect?</h3>
            <p className="text-[var(--ink-2)]">Planqer does not collect any personal data. All processing happens locally in your browser. Projects are saved only on your device.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What browsers are supported?</h3>
            <p className="text-[var(--ink-2)]">Planqer works best on modern browsers: Chrome, Firefox, Safari, and Edge. Internet Explorer is not supported. Enable JavaScript and local storage for full functionality.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Can I export or print the results?</h3>
            <p className="text-[var(--ink-2)]">Yes! Results include visual cutting diagrams that you can print or screenshot. Project data is saved locally and can be reloaded anytime.</p>
          </div>
        </div>
      </div>

      {/* Usage Questions */}
      <div className="dark:border border-[var(--signal)] rounded-xl p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-6 flex items-center gap-3">Usage Questions
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What units does Planqer use?</h3>
            <p className="text-[var(--ink-2)]">Planqer primarily uses millimeters (mm) for consistency. The 3D file processors support multiple units (mm, cm, m, inches, feet) with automatic conversion.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">How do I set the kerf (saw blade width)?</h3>
            <p className="text-[var(--ink-2)]">Enter the kerf width in the optimization settings. Typical values: 3mm for general purpose, 2-4mm for table saws, 3-5mm for circular saws. This affects how much material is lost per cut.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Can I save and reload my projects?</h3>
            <p className="text-[var(--ink-2)]">Yes! All optimizers have project management features. Name your project, click"Save" to store locally, then use"Load" to retrieve saved configurations. Data never leaves your browser.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What if my parts don't fit in available materials?</h3>
            <p className="text-[var(--ink-2)]">Add larger board lengths or sheet sizes to your available materials. Check that part dimensions are correct. For sheets, enable rotation to try different orientations.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Why am I getting high waste results?</h3>
            <p className="text-[var(--ink-2)]">Try adding more material size options, use the Genetic Algorithm for better optimization, enable rotation for sheets, or verify your kerf width isn't set too high.</p>
          </div>
        </div>
      </div>

      {/* File Format Questions */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-6 flex items-center gap-3">File Format Questions
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What 3D file formats are supported?</h3>
            <p className="text-[var(--ink-2)]">STL files for 3D Model to Cutlist, and STEP/STP files for STEP CAD to Cutlist. STL files are limited to 50MB, STEP files to 100MB.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What's the difference between STL and STEP files?</h3>
            <p className="text-[var(--ink-2)]">STL files contain only geometry (triangular mesh). STEP files preserve CAD metadata like component names, materials, and assembly structure - giving much richer information for cutlist generation.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">My 3D file processing failed. What should I do?</h3>
            <div className="text-[var(--ink-2)] space-y-2">
              <p>Common solutions:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Check file size limits (STL: 50MB, STEP: 100MB)</li>
                <li>Verify file extension (.stl, .step, .stp)</li>
                <li>Try re-exporting from your CAD software</li>
                <li>Use binary STL instead of ASCII for smaller files</li>
                <li>Simplify complex models before export</li>
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Can I process files from any CAD software?</h3>
            <p className="text-[var(--ink-2)]">Yes! Any CAD software that can export STL or STEP files will work: SolidWorks, AutoCAD, Fusion 360, SketchUp, Blender, FreeCAD, and many others.</p>
          </div>
        </div>
      </div>

      {/* Advanced Questions */}
      <div className="dark:border border-[var(--rule-hair)] rounded-xl p-6">
        <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-6 flex items-center gap-3">Advanced Questions
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Can I optimize multiple materials at once?</h3>
            <p className="text-[var(--ink-2)]">Not directly in a single optimization, but the STEP CAD processor groups components by material type, allowing you to optimize each material separately for best results.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">How does the Genetic Algorithm work?</h3>
            <p className="text-[var(--ink-2)]">The Genetic Algorithm evolves cutting solutions over multiple generations, combining successful patterns and mutating them to find increasingly better solutions. It takes longer but often finds significantly better results than fast algorithms.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">What is Guillotine Cut optimization?</h3>
            <p className="text-[var(--ink-2)]">Guillotine Cut ensures all cuts can be made with straight-line cuts from edge to edge, which is required for some manufacturing processes and large-scale industrial cutting equipment.</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--ink-2)] mb-2">Can I contribute to Planqer's development?</h3>
            <p className="text-[var(--ink-2)]">Yes! Planqer is open-source under the MIT license. You can contribute code, report bugs, or suggest features on our GitHub repository.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const LegalSection = () => (
  <div>
    <h1 className="text-3xl font-bold text-[var(--ink-2)] mb-6 flex items-center gap-3">Legal Information & License
    </h1>
    
    <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4">MIT License</h2>
    <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4 font-mono text-sm">
      <p>Copyright (c) 2024 Planqer</p>
      <br />
      <p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the"Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:</p>
      <br />
      <p>The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.</p>
      <br />
      <p>THE SOFTWARE IS PROVIDED"AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p>
    </div>
    
    <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 mt-8">Disclaimer</h2>
    <div className="bg-[var(--ground-2)] border-2 border-[var(--signal)] border rounded-lg p-4">
      <p className="font-semibold text-[var(--ink)] mb-2">Important Safety Notice</p>
      <ul className="text-[var(--ink)] space-y-2">
        <li>Planqer provides cutting suggestions for planning purposes only</li>
        <li>Always verify measurements and calculations before cutting materials</li>
        <li>Consider safety margins and material tolerances in your projects</li>
        <li>Follow proper safety procedures when operating power tools</li>
        <li>Users are responsible for the accuracy and safety of their cutting operations</li>
      </ul>
    </div>
    
    <h2 className="text-2xl font-semibold text-[var(--ink-2)] mb-4 mt-8">Privacy Policy</h2>
    <p className="text-[var(--ink-2)] mb-6">Planqer does not collect, store, or transmit any personal data. All processing happens locally in your browser. Projects are saved in your browser's local storage and never leave your device.
    </p>
    
    <div className="bg-[var(--ground-2)] border border-[var(--rule-hair)] rounded-lg p-4 mt-6">
      <p className="font-semibold text-[var(--ink)] text-[var(--ink-3)] mb-2">Open Source</p>
      <p className="text-[var(--ink)] text-[var(--ink-3)]">Planqer believes in open-source software. The complete source code, documentation, and development history are available for review, modification, and contribution.</p>
    </div>
  </div>
);

export default HelpPage;