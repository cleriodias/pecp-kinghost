<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'phone',
        'chave_pix',
        'password',
        'funcao',
        'funcao_original',
        'hr_ini',
        'hr_fim',
        'salario',
        'vr_cred',
        'payment_day',
        'is_active',
        'tb2_id',
        'cod_acesso',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'phone' => 'string',
            'chave_pix' => 'string',
            'funcao' => 'integer',
            'funcao_original' => 'integer',
            'hr_ini' => 'string',
            'hr_fim' => 'string',
            'salario' => 'float',
            'vr_cred' => 'float',
            'payment_day' => 'integer',
            'is_active' => 'boolean',
            'tb2_id' => 'integer',
            'cod_acesso' => 'string',
        ];
    }

    public function scopeActive(Builder $query): Builder
    {
        if (! Schema::hasColumn($this->getTable(), 'is_active')) {
            return $query;
        }

        return $query->where('is_active', true);
    }

    public function units(): BelongsToMany
    {
        return $this->belongsToMany(Unidade::class, 'tb2_unidade_user', 'user_id', 'tb2_id')->withTimestamps();
    }

    public function primaryUnit(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'tb2_id', 'tb2_id');
    }

    public function onlineSessions(): HasMany
    {
        return $this->hasMany(OnlineUser::class, 'user_id');
    }

    public function sentChatMessages(): HasMany
    {
        return $this->hasMany(ChatMessage::class, 'sender_id');
    }

    public function receivedChatMessages(): HasMany
    {
        return $this->hasMany(ChatMessage::class, 'recipient_id');
    }
}
