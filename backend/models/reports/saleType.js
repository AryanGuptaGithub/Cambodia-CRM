import mongoose from 'mongoose';

const saleTypeSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('SaleType', saleTypeSchema);
