import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CatalogPage from './CatalogPage';

const DOCS_URL = 'https://nordstad.github.io/Planqer/';

const sections = [
  { id: 'getting-started', title: 'help.sectionGettingStarted', no: '01' },
  { id: 'choose-tool', title: 'help.sectionChooseTool', no: '02' },
  { id: 'tile-layout', title: 'help.sectionTileLayout', no: '03' },
  { id: 'results', title: 'help.sectionResults', no: '04' },
  { id: 'troubleshooting', title: 'help.sectionTroubleshooting', no: '05' },
];

const FullDocsLink = ({ t }) => (
  <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="btn">
    {t('help.fullDocumentation')}
  </a>
);

const HelpPage = () => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState('getting-started');

  return (
    <CatalogPage>
    <div className="grid gap-x-9 gap-y-6 lg:grid-cols-[210px_minmax(0,1fr)]" style={{ marginTop: '18px' }}>
      <div>
        <div className="lg:sticky lg:top-5">
          <div className="section-rule">
            <h2 className="section-title">{t('help.contents')}</h2>
          </div>
          <nav aria-label={t('help.contents')}>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="help-entry"
                data-current={activeSection === section.id ? 'true' : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="help-entry-no">{section.no}</span>
                <span className="help-entry-title">{t(section.title)}</span>
              </a>
            ))}
          </nav>
          <p className="synthetic" style={{ marginTop: '14px' }}>
            {t('help.quickReference')}
          </p>
          <div style={{ marginTop: '18px' }}>
            <FullDocsLink t={t} />
          </div>
        </div>
      </div>

      <div className="help-prose" style={{ minWidth: 0 }}>
        <section id="getting-started" className="help-section">
          <p className="eyebrow">{t('help.eyebrow')}</p>
          <h1>{t('help.startTitle')}</h1>
          <p>
            {t('help.startIntro')}
          </p>
          <div className="help-callout">
            <strong>{t('help.threeSteps')}</strong>
            <ol>
              <li>{t('help.startStepOne')}</li>
              <li>{t('help.startStepTwo')}</li>
              <li>{t('help.startStepThree')}</li>
            </ol>
          </div>
          <p>
            {t('help.fullDocsIntro')}
          </p>
        </section>

        <section id="choose-tool" className="help-section">
          <div className="section-rule">
            <h2 className="section-title">{t('help.chooseTitle')}</h2>
          </div>
          <table className="cat-table">
            <thead>
              <tr><th>{t('help.tableTool')}</th><th>{t('help.tableUse')}</th><th>{t('help.tableInput')}</th></tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: 'left' }}><Link to="/cutting">{t('common.boardCutting')}</Link></td>
                <td style={{ textAlign: 'left' }}>{t('help.boardUse')}</td>
                <td>{t('help.boardInput')}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}><Link to="/sheet-cutting">{t('common.sheetCutting')}</Link></td>
                <td style={{ textAlign: 'left' }}>{t('help.sheetUse')}</td>
                <td>{t('help.sheetInput')}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}><Link to="/tile-layout">{t('common.tileLayout')}</Link></td>
                <td style={{ textAlign: 'left' }}>{t('help.tileUse')}</td>
                <td>{t('help.tileInput')}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}><Link to="/model-cutlist">{t('common.modelCutlist')} cutlist</Link></td>
                <td style={{ textAlign: 'left' }}>{t('help.modelUse')}</td>
                <td>{t('help.modelInput')}</td>
              </tr>
            </tbody>
          </table>
          <p>
            {t('help.chooseIntro')}
          </p>
        </section>

        <section id="tile-layout" className="help-section">
          <div className="section-rule">
            <h2 className="section-title">{t('help.tileTitle')}</h2>
          </div>
          <p>
            {t('help.tileIntro')}
          </p>
          <div className="help-grid">
            <div>
                <h3>{t('help.surfaceTitle')}</h3>
                <p>{t('help.surfaceText')}</p>
            </div>
            <div>
                <h3>{t('help.jointTitle')}</h3>
                <p>{t('help.jointText')}</p>
            </div>
            <div>
                <h3>{t('help.bondTitle')}</h3>
                <p>{t('help.bondText')}</p>
            </div>
            <div>
                <h3>{t('help.openingsTitle')}</h3>
                <p>{t('help.openingsText')}</p>
            </div>
            <div>
                <h3>{t('help.candidatesTitle')}</h3>
                <p>{t('help.candidatesText')}</p>
            </div>
            <div>
                <h3>{t('help.templatesTitle')}</h3>
                <p>{t('help.templatesText')}</p>
            </div>
          </div>
        </section>

        <section id="results" className="help-section">
          <div className="section-rule">
            <h2 className="section-title">{t('help.resultsTitle')}</h2>
          </div>
          <table className="cat-table">
            <tbody>
              <tr><td>{t('help.cutPlan')}</td><td style={{ textAlign: 'left' }}>{t('help.cutPlanText')}</td></tr>
              <tr><td>{t('help.kerf')}</td><td style={{ textAlign: 'left' }}>{t('help.kerfText')}</td></tr>
              <tr><td>{t('help.offcut')}</td><td style={{ textAlign: 'left' }}>{t('help.offcutText')}</td></tr>
              <tr><td>{t('help.efficiency')}</td><td style={{ textAlign: 'left' }}>{t('help.efficiencyText')}</td></tr>
              <tr><td>{t('help.cost')}</td><td style={{ textAlign: 'left' }}>{t('help.costText')}</td></tr>
            </tbody>
          </table>
          <div className="help-callout help-callout-warning">
            <strong>{t('help.beforeCutting')}</strong>
            <p>{t('help.beforeCuttingText')}</p>
          </div>
          <p>
            {t('help.saveIntro')}
          </p>
        </section>

        <section id="troubleshooting" className="help-section">
          <div className="section-rule">
            <h2 className="section-title">{t('help.troubleshootingTitle')}</h2>
          </div>
          <div className="help-faq">
            <div><h3>{t('help.partsFailTitle')}</h3><p>{t('help.partsFailText')}</p></div>
            <div><h3>{t('help.wasteTitle')}</h3><p>{t('help.wasteText')}</p></div>
            <div><h3>{t('help.uploadTitle')}</h3><p>{t('help.uploadText')}</p></div>
            <div><h3>{t('help.saveFailTitle')}</h3><p>{t('help.saveFailText')}</p></div>
          </div>
          <p>
            {t('help.troubleshootingIntro')}
          </p>
          <FullDocsLink t={t} />
        </section>
      </div>
    </div>
    </CatalogPage>
  );
};

export default HelpPage;
