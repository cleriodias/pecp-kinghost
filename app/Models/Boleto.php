<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Unidade;
use App\Models\User;

class Boleto extends Model
{
    use HasFactory;

    protected $table = 'tb_16_boletos';

    protected $fillable = [
        'unit_id',
        'user_id',
        'description',
        'amount',
        'due_date',
        'barcode',
        'digitable_line',
        'is_paid',
        'paid_by',
        'paid_at',
    ];

    protected $casts = [
        'unit_id' => 'integer',
        'user_id' => 'integer',
        'amount' => 'float',
        'due_date' => 'date',
        'is_paid' => 'boolean',
        'paid_by' => 'integer',
        'paid_at' => 'datetime',
    ];

    public function unit()
    {
        return $this->belongsTo(Unidade::class, 'unit_id', 'tb2_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function paidBy()
    {
        return $this->belongsTo(User::class, 'paid_by');
    }

    public function scopeForUnit($query, $unitId)
    {
        if ($unitId === null) {
            return $query;
        }

        return $query->where('unit_id', $unitId);
    }

    public function scopeWithPaidStatus($query, ?string $status)
    {
        if ($status === 'paid') {
            return $query->where('is_paid', true);
        }

        if ($status === 'unpaid') {
            return $query->where('is_paid', false);
        }

        return $query;
    }
}
