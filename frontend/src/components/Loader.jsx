/*
  Work in progress, set as press furniture: three ink squares stepping, not a
  spinning ring. The bootstrap spinner it replaced never had its CSS loaded.
*/
const Loader = () => (
  <span className="loader-steps" role="status" aria-label="Working">
    <i /><i /><i />
  </span>
);

export default Loader;
