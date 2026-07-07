const mongoose = require('mongoose')

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

/**
 * Atomically increment a named counter and return the new sequence value.
 *
 * Uses MongoDB's $inc operator inside findOneAndUpdate, which is an atomic
 * server-side operation — no race condition is possible regardless of how many
 * concurrent callers hit this at the same millisecond.  Even if the outer
 * transaction is aborted after this call, the counter remains incremented
 * (creating a harmless gap in numbering — gaps are always preferable to
 * duplicate document numbers).
 */
counterSchema.statics.next = async function (name) {
  const doc = await this.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  )
  return doc.seq
}

module.exports = mongoose.model('Counter', counterSchema)
