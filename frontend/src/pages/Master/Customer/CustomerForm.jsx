const CustomerForm = ({ form = {}, setForm = () => {} }) => {
  return (
    <>
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input
          type="text"
          value={form.name || ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full border px-3 py-2 rounded-lg capitalize"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          value={form.email || ""}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full border px-3 py-2 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Phone</label>
        <input
          type="text"
          value={form.phone || ""}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full border px-3 py-2 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Warehouse</label>
        <input
          type="text"
          value={form.warehouse || ""}
          onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
          className="w-full border px-3 py-2 rounded-lg capitalize"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Tax Number</label>
        <input
          type="text"
          value={form.taxNumber || ""}
          onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
          className="w-full border px-3 py-2 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Opening Balance</label>
        <input
          type="number"
          value={form.openingBalance || ""}
          onChange={(e) =>
            setForm({ ...form, openingBalance: e.target.value })
          }
          className="w-full border px-3 py-2 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Type</label>
        <select
          value={form.type || ""}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="w-full border px-3 py-2 rounded-lg"
        >
          <option value="">Select</option>
          <option value="pay">To Pay</option>
          <option value="receive">To Collect</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Credit Period</label>
        <input
          type="number"
          value={form.creditPeriod || ""}
          onChange={(e) =>
            setForm({ ...form, creditPeriod: e.target.value })
          }
          className="w-full border px-3 py-2 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Credit Limit</label>
        <input
          type="number"
          value={form.creditLimit || ""}
          onChange={(e) =>
            setForm({ ...form, creditLimit: e.target.value })
          }
          className="w-full border px-3 py-2 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Status</label>
        <select
          value={form.status || ""}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="w-full border px-3 py-2 rounded-lg"
        >
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Password</label>
        <input
          type="password"
          value={form.password || ""}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full border px-3 py-2 rounded-lg"
        />
      </div>
    </>
  );
};

export default CustomerForm;
