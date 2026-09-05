<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement("ALTER TABLE tb4_vendas_pg MODIFY tipo_pagamento VARCHAR(40) NOT NULL");
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement("ALTER TABLE tb4_vendas_pg MODIFY tipo_pagamento VARCHAR(20) NOT NULL");
    }
};
