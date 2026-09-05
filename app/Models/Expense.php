<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Unidade;
use App\Models\User;

class Expense extends Model
{
    use HasFactory;

    protected $fillable = [
        'supplier_id',
        'unit_id',
        'user_id',
        'expense_date',
        'amount',
        'notes',
    ];

    protected $casts = [
        'unit_id' => 'integer',
        'user_id' => 'integer',
        'expense_date' => 'date',
        'amount' => 'float',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'unit_id', 'tb2_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
