import mongoose from 'mongoose';

const SupportTicketSchema = new mongoose.Schema({
  ticketId:    { type: String, unique: true, trim: true },
  subject:     { type: String, required: true, trim: true },
  category:    { type: String, enum: ['Technical', 'Billing', 'Inventory', 'POS', 'Other'], default: 'Other' },
  priority:    { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  description: { type: String, trim: true },
  status:      { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open' },
  createdBy:   { type: String, default: 'Admin' },
  messages:    [{ sender: String, text: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true });

export const getSupportTicketModel = (connection) => {
  try { return connection.model('SupportTicket'); }
  catch { return connection.model('SupportTicket', SupportTicketSchema); }
};
