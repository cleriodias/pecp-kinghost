<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('tb_17_configuracao_descarte', function (Blueprint $table) {
            $table->id();
            $table->decimal('percentual_aceitavel', 5, 2)->default(0);
            $table->timestamps();
        });

        DB::table('tb_17_configuracao_descarte')->insert([
            'percentual_aceitavel' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb_17_configuracao_descarte');
    }
};
