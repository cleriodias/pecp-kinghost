<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesDispute extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_name',
        'quantity',
        'created_by',
    ];

    protected $casts = [
        'quantity' => 'integer',
    ];

    public function bids(): HasMany
    {
        return $this->hasMany(SalesDisputeBid::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
