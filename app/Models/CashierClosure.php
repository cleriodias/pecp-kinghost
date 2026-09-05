<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashierClosure extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'unit_id',
        'unit_name',
        'cash_amount',
        'card_amount',
        'open_comandas_observation',
        'master_cash_amount',
        'master_card_amount',
        'closed_date',
        'closed_at',
        'master_checked_by',
        'master_checked_at',
    ];

    protected $casts = [
        'cash_amount' => 'float',
        'card_amount' => 'float',
        'master_cash_amount' => 'float',
        'master_card_amount' => 'float',
        'closed_date' => 'date',
        'closed_at' => 'datetime',
        'master_checked_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
