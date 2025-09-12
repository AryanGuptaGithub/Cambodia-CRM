import CustomerForm from "./CustomerForm";
import CustomerView from "./CustomerView";
import CustomerImportModal from "./CustomerImportModal";

const Customer = () => {
  // Use these components inside return or conditionally
  return (
    <div>
      <h1>Customer Page</h1>
      {/* Example usage */}
      <CustomerForm />
      <CustomerView />
      <CustomerImportModal />
    </div>
  );
};

export default Customer;



