<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OnlineUser extends Model
{
    use HasFactory;

    protected $table = 'tb21_usuarios_online';

    protected $fillable = [
        'user_id',
        'session_id',
        'active_role',
        'active_unit_id',
        'last_seen_at',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'active_role' => 'integer',
            'active_unit_id' => 'integer',
            'last_seen_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'active_unit_id', 'tb2_id');
    }
}
