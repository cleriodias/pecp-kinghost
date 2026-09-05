<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesDisputeBid extends Model
{
    use HasFactory;

    protected $fillable = [
        'sales_dispute_id',
        'supplier_id',
        'unit_cost',
        'approved_at',
        'approved_by',
        'invoice_note',
        'invoice_file_path',
        'invoiced_at',
    ];

    protected $casts = [
        'unit_cost' => 'float',
        'approved_at' => 'datetime',
        'approved_by' => 'integer',
        'invoiced_at' => 'datetime',
    ];

    public function dispute(): BelongsTo
    {
        return $this->belongsTo(SalesDispute::class, 'sales_dispute_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }
}
