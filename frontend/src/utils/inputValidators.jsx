export const handleNumericInputChange = (e, fn) => {
  const value = e.target.value;
  if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
    fn(e);
  }
};