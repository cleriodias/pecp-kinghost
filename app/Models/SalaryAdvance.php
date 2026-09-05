<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Unidade;

class SalaryAdvance extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'unit_id',
        'advance_date',
        'amount',
        'reason',
    ];

    protected $casts = [
        'unit_id' => 'integer',
        'advance_date' => 'date',
        'amount' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'unit_id', 'tb2_id');
    }
}
