const PlanSummary = ({ title, rows }) => <section><div className="section-rule"><h2 className="section-title">{title}</h2></div><dl className="plan-summary">{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl></section>;

export default PlanSummary;
